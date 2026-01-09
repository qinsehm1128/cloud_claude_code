package services

import (
	"errors"
	"strings"

	"cc-platform/internal/config"
	"cc-platform/internal/models"
	"cc-platform/pkg/crypto"

	"gorm.io/gorm"
)

var (
	ErrProfileNotFound     = errors.New("profile not found")
	ErrTokenNotFound       = errors.New("token not found")
	ErrDefaultCannotDelete = errors.New("cannot delete default profile")
	ErrInvalidEnvVars      = errors.New("invalid environment variables format")
)

// ConfigProfileService handles multi-configuration profiles
type ConfigProfileService struct {
	db     *gorm.DB
	config *config.Config
}

// NewConfigProfileService creates a new ConfigProfileService
func NewConfigProfileService(db *gorm.DB, cfg *config.Config) *ConfigProfileService {
	return &ConfigProfileService{
		db:     db,
		config: cfg,
	}
}

// ==================== GitHub Token Methods ====================

// GitHubTokenResponse represents a GitHub token without the actual token value
type GitHubTokenResponse struct {
	ID        uint   `json:"id"`
	Nickname  string `json:"nickname"`
	Remark    string `json:"remark,omitempty"`
	IsDefault bool   `json:"is_default"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// CreateGitHubTokenInput represents input for creating a GitHub token
type CreateGitHubTokenInput struct {
	Nickname  string `json:"nickname" binding:"required"`
	Remark    string `json:"remark"`
	Token     string `json:"token" binding:"required"`
	IsDefault bool   `json:"is_default"`
}

// UpdateGitHubTokenInput represents input for updating a GitHub token
type UpdateGitHubTokenInput struct {
	Nickname  string `json:"nickname"`
	Remark    string `json:"remark"`
	Token     string `json:"token"` // Optional, only update if provided
	IsDefault bool   `json:"is_default"`
}

// ListGitHubTokens returns all GitHub tokens (without token values)
func (s *ConfigProfileService) ListGitHubTokens() ([]GitHubTokenResponse, error) {
	var tokens []models.GitHubToken
	if err := s.db.Order("created_at DESC").Find(&tokens).Error; err != nil {
		return nil, err
	}

	responses := make([]GitHubTokenResponse, len(tokens))
	for i, t := range tokens {
		responses[i] = GitHubTokenResponse{
			ID:        t.ID,
			Nickname:  t.Nickname,
			Remark:    t.Remark,
			IsDefault: t.IsDefault,
			CreatedAt: t.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt: t.UpdatedAt.Format("2006-01-02 15:04:05"),
		}
	}
	return responses, nil
}

// CreateGitHubToken creates a new GitHub token
func (s *ConfigProfileService) CreateGitHubToken(input CreateGitHubTokenInput) (*GitHubTokenResponse, error) {
	// Encrypt the token
	encryptedToken, err := crypto.Encrypt(input.Token, []byte(s.config.EncryptionKey))
	if err != nil {
		return nil, err
	}

	// If this is set as default, unset other defaults
	if input.IsDefault {
		s.db.Model(&models.GitHubToken{}).Where("is_default = ?", true).Update("is_default", false)
	}

	token := &models.GitHubToken{
		Nickname:  input.Nickname,
		Remark:    input.Remark,
		Token:     encryptedToken,
		IsDefault: input.IsDefault,
	}

	if err := s.db.Create(token).Error; err != nil {
		return nil, err
	}

	return &GitHubTokenResponse{
		ID:        token.ID,
		Nickname:  token.Nickname,
		Remark:    token.Remark,
		IsDefault: token.IsDefault,
		CreatedAt: token.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt: token.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}

// UpdateGitHubToken updates an existing GitHub token
func (s *ConfigProfileService) UpdateGitHubToken(id uint, input UpdateGitHubTokenInput) error {
	var token models.GitHubToken
	if err := s.db.First(&token, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrTokenNotFound
		}
		return err
	}

	// If setting as default, unset other defaults
	if input.IsDefault && !token.IsDefault {
		s.db.Model(&models.GitHubToken{}).Where("is_default = ? AND id != ?", true, id).Update("is_default", false)
	}

	updates := map[string]interface{}{
		"nickname":   input.Nickname,
		"remark":     input.Remark,
		"is_default": input.IsDefault,
	}

	// Only update token if provided
	if input.Token != "" {
		encryptedToken, err := crypto.Encrypt(input.Token, []byte(s.config.EncryptionKey))
		if err != nil {
			return err
		}
		updates["token"] = encryptedToken
	}

	return s.db.Model(&token).Updates(updates).Error
}

// DeleteGitHubToken deletes a GitHub token
func (s *ConfigProfileService) DeleteGitHubToken(id uint) error {
	var token models.GitHubToken
	if err := s.db.First(&token, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrTokenNotFound
		}
		return err
	}

	return s.db.Delete(&token).Error
}

// SetDefaultGitHubToken sets a token as the default
func (s *ConfigProfileService) SetDefaultGitHubToken(id uint) error {
	var token models.GitHubToken
	if err := s.db.First(&token, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrTokenNotFound
		}
		return err
	}

	// Unset all other defaults
	s.db.Model(&models.GitHubToken{}).Where("is_default = ?", true).Update("is_default", false)

	// Set this as default
	return s.db.Model(&token).Update("is_default", true).Error
}

// GetGitHubTokenValue returns the decrypted token value for a specific token
func (s *ConfigProfileService) GetGitHubTokenValue(id uint) (string, error) {
	var token models.GitHubToken
	if err := s.db.First(&token, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", ErrTokenNotFound
		}
		return "", err
	}

	if token.Token == "" {
		return "", ErrTokenNotFound
	}

	decrypted, err := crypto.Decrypt(token.Token, []byte(s.config.EncryptionKey))
	if err != nil {
		// Decryption failed - token may be corrupted or key changed
		return "", ErrTokenNotFound
	}
	return decrypted, nil
}

// GetDefaultGitHubToken returns the decrypted default token value
func (s *ConfigProfileService) GetDefaultGitHubToken() (string, error) {
	var token models.GitHubToken
	if err := s.db.Where("is_default = ?", true).First(&token).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Fallback to first token if no default set
			if err := s.db.First(&token).Error; err != nil {
				return "", ErrTokenNotFound
			}
		} else {
			return "", err
		}
	}

	if token.Token == "" {
		return "", ErrTokenNotFound
	}

	decrypted, err := crypto.Decrypt(token.Token, []byte(s.config.EncryptionKey))
	if err != nil {
		// Decryption failed - token may be corrupted or key changed
		return "", ErrTokenNotFound
	}
	return decrypted, nil
}

// GetGitHubTokenForContainer returns the token value for container creation
// If tokenID is nil, returns the default token
func (s *ConfigProfileService) GetGitHubTokenForContainer(tokenID *uint) (string, error) {
	if tokenID != nil {
		return s.GetGitHubTokenValue(*tokenID)
	}
	return s.GetDefaultGitHubToken()
}

// HasGitHubTokens checks if any GitHub tokens are configured
func (s *ConfigProfileService) HasGitHubTokens() bool {
	var count int64
	s.db.Model(&models.GitHubToken{}).Count(&count)
	return count > 0
}

// ==================== Env Vars Profile Methods ====================

// EnvVarsProfileResponse represents an env vars profile response
type EnvVarsProfileResponse struct {
	ID              uint   `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description,omitempty"`
	EnvVars         string `json:"env_vars"`
	ApiUrlVarName   string `json:"api_url_var_name,omitempty"`
	ApiTokenVarName string `json:"api_token_var_name,omitempty"`
	IsDefault       bool   `json:"is_default"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

// CreateEnvProfileInput represents input for creating an env vars profile
type CreateEnvProfileInput struct {
	Name            string `json:"name" binding:"required"`
	Description     string `json:"description"`
	EnvVars         string `json:"env_vars" binding:"required"`
	ApiUrlVarName   string `json:"api_url_var_name"`   // Variable name for API URL (e.g., ANTHROPIC_BASE_URL)
	ApiTokenVarName string `json:"api_token_var_name"` // Variable name for API Token (e.g., ANTHROPIC_API_KEY)
	IsDefault       bool   `json:"is_default"`
}

// UpdateEnvProfileInput represents input for updating an env vars profile
type UpdateEnvProfileInput struct {
	Name            string `json:"name"`
	Description     string `json:"description"`
	EnvVars         string `json:"env_vars"`
	ApiUrlVarName   string `json:"api_url_var_name"`
	ApiTokenVarName string `json:"api_token_var_name"`
	IsDefault       bool   `json:"is_default"`
}

// ListEnvProfiles returns all environment variable profiles
func (s *ConfigProfileService) ListEnvProfiles() ([]EnvVarsProfileResponse, error) {
	var profiles []models.EnvVarsProfile
	if err := s.db.Order("created_at DESC").Find(&profiles).Error; err != nil {
		return nil, err
	}

	responses := make([]EnvVarsProfileResponse, len(profiles))
	for i, p := range profiles {
		responses[i] = EnvVarsProfileResponse{
			ID:              p.ID,
			Name:            p.Name,
			Description:     p.Description,
			EnvVars:         p.EnvVars,
			ApiUrlVarName:   p.ApiUrlVarName,
			ApiTokenVarName: p.ApiTokenVarName,
			IsDefault:       p.IsDefault,
			CreatedAt:       p.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:       p.UpdatedAt.Format("2006-01-02 15:04:05"),
		}
	}
	return responses, nil
}

// CreateEnvProfile creates a new environment variables profile
func (s *ConfigProfileService) CreateEnvProfile(input CreateEnvProfileInput) (*EnvVarsProfileResponse, error) {
	// Validate env vars format
	if _, err := s.ParseEnvVars(input.EnvVars); err != nil {
		return nil, err
	}

	// If this is set as default, unset other defaults
	if input.IsDefault {
		s.db.Model(&models.EnvVarsProfile{}).Where("is_default = ?", true).Update("is_default", false)
	}

	profile := &models.EnvVarsProfile{
		Name:            input.Name,
		Description:     input.Description,
		EnvVars:         input.EnvVars,
		ApiUrlVarName:   input.ApiUrlVarName,
		ApiTokenVarName: input.ApiTokenVarName,
		IsDefault:       input.IsDefault,
	}

	if err := s.db.Create(profile).Error; err != nil {
		return nil, err
	}

	return &EnvVarsProfileResponse{
		ID:              profile.ID,
		Name:            profile.Name,
		Description:     profile.Description,
		EnvVars:         profile.EnvVars,
		ApiUrlVarName:   profile.ApiUrlVarName,
		ApiTokenVarName: profile.ApiTokenVarName,
		IsDefault:       profile.IsDefault,
		CreatedAt:       profile.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:       profile.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}

// UpdateEnvProfile updates an existing environment variables profile
func (s *ConfigProfileService) UpdateEnvProfile(id uint, input UpdateEnvProfileInput) error {
	var profile models.EnvVarsProfile
	if err := s.db.First(&profile, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProfileNotFound
		}
		return err
	}

	// Validate env vars format if provided
	if input.EnvVars != "" {
		if _, err := s.ParseEnvVars(input.EnvVars); err != nil {
			return err
		}
	}

	// If setting as default, unset other defaults
	if input.IsDefault && !profile.IsDefault {
		s.db.Model(&models.EnvVarsProfile{}).Where("is_default = ? AND id != ?", true, id).Update("is_default", false)
	}

	updates := map[string]interface{}{
		"name":               input.Name,
		"description":        input.Description,
		"env_vars":           input.EnvVars,
		"api_url_var_name":   input.ApiUrlVarName,
		"api_token_var_name": input.ApiTokenVarName,
		"is_default":         input.IsDefault,
	}

	return s.db.Model(&profile).Updates(updates).Error
}

// DeleteEnvProfile deletes an environment variables profile
func (s *ConfigProfileService) DeleteEnvProfile(id uint) error {
	var profile models.EnvVarsProfile
	if err := s.db.First(&profile, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProfileNotFound
		}
		return err
	}

	return s.db.Delete(&profile).Error
}

// SetDefaultEnvProfile sets a profile as the default
func (s *ConfigProfileService) SetDefaultEnvProfile(id uint) error {
	var profile models.EnvVarsProfile
	if err := s.db.First(&profile, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProfileNotFound
		}
		return err
	}

	// Unset all other defaults
	s.db.Model(&models.EnvVarsProfile{}).Where("is_default = ?", true).Update("is_default", false)

	// Set this as default
	return s.db.Model(&profile).Update("is_default", true).Error
}

// GetEnvVars returns parsed environment variables for a profile
// If profileID is nil, returns the default profile's env vars
func (s *ConfigProfileService) GetEnvVars(profileID *uint) (map[string]string, error) {
	var profile models.EnvVarsProfile

	if profileID != nil {
		if err := s.db.First(&profile, *profileID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrProfileNotFound
			}
			return nil, err
		}
	} else {
		// Get default profile
		if err := s.db.Where("is_default = ?", true).First(&profile).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// No default profile, return empty map
				return make(map[string]string), nil
			}
			return nil, err
		}
	}

	return s.ParseEnvVars(profile.EnvVars)
}

// ParseEnvVars parses multi-line environment variables string into a map
func (s *ConfigProfileService) ParseEnvVars(envVarsStr string) (map[string]string, error) {
	result := make(map[string]string)
	if envVarsStr == "" {
		return result, nil
	}

	lines := strings.Split(envVarsStr, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Remove "export " prefix if present
		line = strings.TrimPrefix(line, "export ")

		// Find first = sign
		idx := strings.Index(line, "=")
		if idx == -1 {
			continue // Skip lines without =
		}

		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])

		// Validate variable name using pre-compiled regex
		if !envVarNamePattern.MatchString(key) {
			return nil, errors.New("invalid variable name: " + key)
		}

		// Remove surrounding quotes (only if length > 1 to avoid panic on single char)
		if len(value) >= 2 {
			if (strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"")) ||
				(strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'")) {
				value = value[1 : len(value)-1]
			}
		}

		result[key] = value
	}

	return result, nil
}

// ==================== Startup Command Profile Methods ====================

// StartupCommandProfileResponse represents a startup command profile response
type StartupCommandProfileResponse struct {
	ID          uint   `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Command     string `json:"command"`
	IsDefault   bool   `json:"is_default"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// CreateCommandProfileInput represents input for creating a startup command profile
type CreateCommandProfileInput struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Command     string `json:"command" binding:"required"`
	IsDefault   bool   `json:"is_default"`
}

// UpdateCommandProfileInput represents input for updating a startup command profile
type UpdateCommandProfileInput struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Command     string `json:"command"`
	IsDefault   bool   `json:"is_default"`
}

// ListCommandProfiles returns all startup command profiles
func (s *ConfigProfileService) ListCommandProfiles() ([]StartupCommandProfileResponse, error) {
	var profiles []models.StartupCommandProfile
	if err := s.db.Order("created_at DESC").Find(&profiles).Error; err != nil {
		return nil, err
	}

	responses := make([]StartupCommandProfileResponse, len(profiles))
	for i, p := range profiles {
		responses[i] = StartupCommandProfileResponse{
			ID:          p.ID,
			Name:        p.Name,
			Description: p.Description,
			Command:     p.Command,
			IsDefault:   p.IsDefault,
			CreatedAt:   p.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:   p.UpdatedAt.Format("2006-01-02 15:04:05"),
		}
	}
	return responses, nil
}

// CreateCommandProfile creates a new startup command profile
func (s *ConfigProfileService) CreateCommandProfile(input CreateCommandProfileInput) (*StartupCommandProfileResponse, error) {
	// If this is set as default, unset other defaults
	if input.IsDefault {
		s.db.Model(&models.StartupCommandProfile{}).Where("is_default = ?", true).Update("is_default", false)
	}

	profile := &models.StartupCommandProfile{
		Name:        input.Name,
		Description: input.Description,
		Command:     input.Command,
		IsDefault:   input.IsDefault,
	}

	if err := s.db.Create(profile).Error; err != nil {
		return nil, err
	}

	return &StartupCommandProfileResponse{
		ID:          profile.ID,
		Name:        profile.Name,
		Description: profile.Description,
		Command:     profile.Command,
		IsDefault:   profile.IsDefault,
		CreatedAt:   profile.CreatedAt.Format("2006-01-02 15:04:05"),
		UpdatedAt:   profile.UpdatedAt.Format("2006-01-02 15:04:05"),
	}, nil
}

// UpdateCommandProfile updates an existing startup command profile
func (s *ConfigProfileService) UpdateCommandProfile(id uint, input UpdateCommandProfileInput) error {
	var profile models.StartupCommandProfile
	if err := s.db.First(&profile, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProfileNotFound
		}
		return err
	}

	// If setting as default, unset other defaults
	if input.IsDefault && !profile.IsDefault {
		s.db.Model(&models.StartupCommandProfile{}).Where("is_default = ? AND id != ?", true, id).Update("is_default", false)
	}

	updates := map[string]interface{}{
		"name":        input.Name,
		"description": input.Description,
		"command":     input.Command,
		"is_default":  input.IsDefault,
	}

	return s.db.Model(&profile).Updates(updates).Error
}

// DeleteCommandProfile deletes a startup command profile
func (s *ConfigProfileService) DeleteCommandProfile(id uint) error {
	var profile models.StartupCommandProfile
	if err := s.db.First(&profile, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProfileNotFound
		}
		return err
	}

	return s.db.Delete(&profile).Error
}

// SetDefaultCommandProfile sets a profile as the default
func (s *ConfigProfileService) SetDefaultCommandProfile(id uint) error {
	var profile models.StartupCommandProfile
	if err := s.db.First(&profile, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrProfileNotFound
		}
		return err
	}

	// Unset all other defaults
	s.db.Model(&models.StartupCommandProfile{}).Where("is_default = ?", true).Update("is_default", false)

	// Set this as default
	return s.db.Model(&profile).Update("is_default", true).Error
}

// GetStartupCommand returns the startup command for a profile
// If profileID is nil, returns the default command
func (s *ConfigProfileService) GetStartupCommand(profileID *uint) string {
	var profile models.StartupCommandProfile

	if profileID != nil {
		if err := s.db.First(&profile, *profileID).Error; err != nil {
			return DefaultStartupCommand
		}
	} else {
		// Get default profile
		if err := s.db.Where("is_default = ?", true).First(&profile).Error; err != nil {
			return DefaultStartupCommand
		}
	}

	if profile.Command == "" {
		return DefaultStartupCommand
	}
	return profile.Command
}

// ==================== API Config Methods ====================

// ApiConfigResponse represents the API configuration for a container
type ApiConfigResponse struct {
	ApiUrl   string `json:"api_url"`
	ApiToken string `json:"api_token"`
}

// GetApiConfig returns the API URL and Token for a profile by extracting values from env vars
// If profileID is nil, returns the default profile's API config
func (s *ConfigProfileService) GetApiConfig(profileID *uint) (*ApiConfigResponse, error) {
	var profile models.EnvVarsProfile

	if profileID != nil {
		if err := s.db.First(&profile, *profileID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrProfileNotFound
			}
			return nil, err
		}
	} else {
		// Get default profile
		if err := s.db.Where("is_default = ?", true).First(&profile).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, ErrProfileNotFound
			}
			return nil, err
		}
	}

	// Check if API var names are configured
	if profile.ApiUrlVarName == "" || profile.ApiTokenVarName == "" {
		return nil, errors.New("API URL or Token variable name not configured in profile")
	}

	// Parse env vars
	envVars, err := s.ParseEnvVars(profile.EnvVars)
	if err != nil {
		return nil, err
	}

	// Extract API URL and Token
	apiUrl, urlExists := envVars[profile.ApiUrlVarName]
	apiToken, tokenExists := envVars[profile.ApiTokenVarName]

	if !urlExists {
		return nil, errors.New("API URL variable not found in env vars: " + profile.ApiUrlVarName)
	}
	if !tokenExists {
		return nil, errors.New("API Token variable not found in env vars: " + profile.ApiTokenVarName)
	}

	return &ApiConfigResponse{
		ApiUrl:   apiUrl,
		ApiToken: apiToken,
	}, nil
}

// GetApiConfigByContainerID returns the API config for a container by its ID
func (s *ConfigProfileService) GetApiConfigByContainerID(containerID uint) (*ApiConfigResponse, error) {
	var container models.Container
	if err := s.db.First(&container, containerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("container not found")
		}
		return nil, err
	}

	return s.GetApiConfig(container.EnvVarsProfileID)
}
