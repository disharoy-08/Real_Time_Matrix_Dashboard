package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024
	clientQueueCap = 512 // Bounded outgoing buffer
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, validate origin against whitelist; allow all for dev
		return true
	},
}

// Client represents a single active WebSocket connection
type Client struct {
	ID         string
	hub        *Hub
	conn       *websocket.Conn
	send       chan *model.MetricEvent
	role       model.Role
	services   map[string]bool // dynamic subscriptions
	filterMu   sync.RWMutex
	droppedCnt int64
}

// Hub maintains the set of active clients and broadcasts events
type Hub struct {
	clients         map[*Client]bool
	register        chan *Client
	unregister      chan *Client
	broadcast       chan *model.MetricEvent
	mu              sync.RWMutex
	totalDispatched int64
	totalDropped    int64
	ctx             context.Context
	cancel          context.CancelFunc
}

// NewHub creates and starts a new WebSocket Hub
func NewHub(parentCtx context.Context) *Hub {
	ctx, cancel := context.WithCancel(parentCtx)
	h := &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *model.MetricEvent, 1024),
		ctx:        ctx,
		cancel:     cancel,
	}
	go h.run()
	return h
}

func (h *Hub) run() {
	for {
		select {
		case <-h.ctx.Done():
			h.mu.Lock()
			for client := range h.clients {
				close(client.send)
				delete(h.clients, client)
			}
			h.mu.Unlock()
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case event := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				// Check client subscription filter
				client.filterMu.RLock()
				subscribed := len(client.services) == 0 || client.services[event.Service]
				client.filterMu.RUnlock()

				if !subscribed {
					continue
				}

				// Non-blocking send on bounded buffer to prevent slow client blocking the hub
				select {
				case client.send <- event:
					atomic.AddInt64(&h.totalDispatched, 1)
				default:
					atomic.AddInt64(&client.droppedCnt, 1)
					atomic.AddInt64(&h.totalDropped, 1)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast dispatches a metric event to all eligible clients
func (h *Hub) Broadcast(event *model.MetricEvent) {
	select {
	case h.broadcast <- event:
	default:
		// Broadcast queue full (under extreme pressure)
		atomic.AddInt64(&h.totalDropped, 1)
	}
}

// ConnectedCount returns active WebSocket clients count
func (h *Hub) ConnectedCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// TotalDispatched returns count of successfully sent events
func (h *Hub) TotalDispatched() int64 {
	return atomic.LoadInt64(&h.totalDispatched)
}

// TotalDropped returns count of events dropped due to client backpressure
func (h *Hub) TotalDropped() int64 {
	return atomic.LoadInt64(&h.totalDropped)
}

// HandleWS upgrades HTTP connection and manages reader/writer loops
func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request, role model.Role, initialServices []string) error {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}

	servicesMap := make(map[string]bool)
	for _, s := range initialServices {
		if s != "" {
			servicesMap[s] = true
		}
	}

	client := &Client{
		hub:      h,
		conn:     conn,
		send:     make(chan *model.MetricEvent, clientQueueCap),
		role:     role,
		services: servicesMap,
	}

	h.register <- client

	// Start separate reader and writer goroutines to guarantee single-threaded socket access
	go client.writePump()
	go client.readPump()

	return nil
}

// readPump reads incoming control messages (e.g. dynamic subscription changes, ping)
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Client read error: %v", err)
			}
			break
		}

		var clientMsg model.ClientMessage
		if err := json.Unmarshal(message, &clientMsg); err == nil {
			if clientMsg.Action == "subscribe" {
				c.filterMu.Lock()
				c.services = make(map[string]bool)
				for _, s := range clientMsg.Services {
					c.services[s] = true
				}
				c.filterMu.Unlock()
			}
		}
	}
}

// writePump pumps messages from the hub to the websocket connection with ping/pong heartbeats
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case event, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteJSON(event); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
