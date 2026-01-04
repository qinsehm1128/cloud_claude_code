package services

import (
	"errors"
	"fmt"
	"log"
	"time"

	"cc-platform/internal/config"
	"cc-platform/internal/models"
	"cc-platform/pkg/crypto"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrTokenExpired       = errors.New("token expired")
	ErrAuthInitFailed     = errors.New("auth service initialization failed")
)

// Claims represents JWT claims
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// AuthService handles authentication operations
type AuthService struct {
	db     *gorm.DB
	config *config.Config
}

// NewAuthService creates a new AuthService
func NewAuthService(db *gorm.DB, cfg *config.Config) (*AuthService, error) {
	svc := &AuthService{
		db:     db,
		config: cfg,
	}

	// Ensure admin user exists
	if err := svc.ensureAdminUser(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrAuthInitFailed, err)
	}

	return svc, nil
}

// ensureAdminUser creates or updates the admin user
func (s *AuthService) ensureAdminUser() error {
	var user models.User
	result := s.db.Where("username = ?", s.config.AdminUsername).First(&user)
	
	hashedPassword, err := crypto.HashPassword(s.config.AdminPassword)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %w", err)
	}

	if result.Error == gorm.ErrRecordNotFound {
		// Create admin user
		user = models.User{
			Username:     s.config.AdminUsername,
			PasswordHash: hashedPassword,
		}
		
		if err := s.db.Create(&user).Error; err != nil {
			return fmt.Errorf("failed to create admin user: %w", err)
		}
		log.Printf("Admin user '%s' created", s.config.AdminUsername)
	} else {
		// Update password if it changed (always update to ensure consistency)
		if err := s.db.Model(&user).Update("password_hash", hashedPassword).Error; err != nil {
			return fmt.Errorf("failed to update admin password: %w", err)
		}
	}
	
	return nil
}

// Login authenticates a user and returns a JWT token
func (s *AuthService) Login(username, password string) (string, error) {
	var user models.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		return "", ErrInvalidCredentials
	}

	if !crypto.CheckPassword(password, user.PasswordHash) {
		return "", ErrInvalidCredentials
	}

	// Generate JWT token
	token, err := s.generateToken(username)
	if err != nil {
		return "", err
	}

	return token, nil
}

// VerifyToken validates a JWT token and returns the claims
func (s *AuthService) VerifyToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(s.config.JWTSecret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// generateToken creates a new JWT token for a user
func (s *AuthService) generateToken(username string) (string, error) {
	claims := &Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "cc-platform",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}
