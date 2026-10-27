package auth

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/disharoy-08/spectrapulse-backend/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var (
	jwtSecret = []byte("spectrapulse-production-secret-telemetry-key-2026")

	// Seeded default users across the 3 required roles
	SeedUsers = map[string]model.User{
		"viewer@spectrapulse.io": {
			ID:       "usr_viewer_01",
			Username: "ViewerUser",
			Email:    "viewer@spectrapulse.io",
			Password: "viewer123",
			Role:     model.RoleViewer,
		},
		"operator@spectrapulse.io": {
			ID:       "usr_operator_01",
			Username: "OperatorUser",
			Email:    "operator@spectrapulse.io",
			Password: "operator123",
			Role:     model.RoleOperator,
		},
		"admin@spectrapulse.io": {
			ID:       "usr_admin_01",
			Username: "AdminUser",
			Email:    "admin@spectrapulse.io",
			Password: "admin123",
			Role:     model.RoleAdmin,
		},
	}
)

// Authenticate checks user credentials
func Authenticate(email, password string) (*model.User, error) {
	u, ok := SeedUsers[strings.ToLower(email)]
	if !ok || u.Password != password {
		return nil, errors.New("invalid email or password")
	}
	return &u, nil
}

// GenerateToken creates a signed JWT token
func GenerateToken(user *model.User) (string, error) {
	claims := model.JWTClaims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "spectrapulse",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// ValidateToken parses and validates a JWT token
func ValidateToken(tokenString string) (*model.JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &model.JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*model.JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token claims")
}

// RequireRole Gin middleware enforcing role-based permissions
func RequireRole(allowedRoles ...model.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		tokenString := ""

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			// Also support token in query parameter for WebSockets or quick links
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization token required"})
			c.Abort()
			return
		}

		claims, err := ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Store user in context
		c.Set("user_id", claims.UserID)
		c.Set("role", claims.Role)
		c.Set("username", claims.Username)

		if len(allowedRoles) == 0 {
			c.Next()
			return
		}

		// Check if user has required role
		permitted := false
		for _, role := range allowedRoles {
			if claims.Role == role || claims.Role == model.RoleAdmin { // Admin has wildcard access
				permitted = true
				break
			}
		}

		if !permitted {
			c.JSON(http.StatusForbidden, gin.H{
				"error":         "Access forbidden: Insufficient permissions",
				"required_roles": allowedRoles,
				"your_role":      claims.Role,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
