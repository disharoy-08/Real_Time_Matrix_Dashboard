package websocket

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/model"
)

func TestHubConcurrencyAndRace(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := NewHub(ctx)

	// Simulate 20 concurrent mock clients subscribing and reading
	var wg sync.WaitGroup
	clientCount := 20
	eventCount := 500

	clients := make([]*Client, clientCount)
	for i := 0; i < clientCount; i++ {
		c := &Client{
			ID:       fmt.Sprintf("client-%d", i),
			hub:      hub,
			send:     make(chan *model.MetricEvent, clientQueueCap),
			role:     model.RoleViewer,
			services: make(map[string]bool),
		}
		clients[i] = c
		hub.register <- c

		wg.Add(1)
		go func(cl *Client) {
			defer wg.Done()
			received := 0
			for {
				select {
				case <-cl.send:
					received++
					if received >= eventCount {
						return
					}
				case <-time.After(2 * time.Second):
					return
				}
			}
		}(c)
	}

	// Wait for registration
	time.Sleep(50 * time.Millisecond)

	// Broadcast events concurrently from 4 producers
	var pWg sync.WaitGroup
	producers := 4
	for p := 0; p < producers; p++ {
		pWg.Add(1)
		go func(prodID int) {
			defer pWg.Done()
			for e := 0; e < eventCount/producers; e++ {
				hub.Broadcast(&model.MetricEvent{
					ID:        fmt.Sprintf("event-%d-%d", prodID, e),
					SeqID:     int64(e),
					Service:   "api-gateway",
					Name:      "cpu_usage_pct",
					Value:     42.5,
					Timestamp: time.Now().UTC(),
				})
			}
		}(p)
	}

	pWg.Wait()
	wg.Wait()

	if hub.TotalDispatched() == 0 {
		t.Errorf("Expected events to be dispatched, got 0")
	}
}
