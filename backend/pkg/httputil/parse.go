package httputil

import (
	"fmt"
	"strconv"

	"github.com/gin-gonic/gin"
)

// ParseIDParam parses a uint ID from a URL parameter
func ParseIDParam(c *gin.Context, paramName string) (uint, error) {
	idStr := c.Param(paramName)
	return ParseID(idStr)
}

// ParseID parses a string to uint ID
func ParseID(idStr string) (uint, error) {
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("invalid ID: %s", idStr)
	}
	return uint(id), nil
}

// ParseIntParam parses an int from a URL parameter with a default value
func ParseIntParam(c *gin.Context, paramName string, defaultValue int) int {
	valueStr := c.Param(paramName)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

// ParseIntQuery parses an int from a query parameter with a default value
func ParseIntQuery(c *gin.Context, queryName string, defaultValue int) int {
	valueStr := c.Query(queryName)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}
