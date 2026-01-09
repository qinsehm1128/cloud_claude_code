package crypto

import (
	"testing"
	"testing/quick"
)

// Property 3: Sensitive Data Encryption
// For any sensitive configuration, the stored value SHALL NOT equal the plaintext input value

// TestEncryptionNotEqualPlaintext verifies that encrypted value is different from plaintext
func TestEncryptionNotEqualPlaintext(t *testing.T) {
	key := []byte("test-encryption-key-32-bytes-ok!")

	f := func(plaintext string) bool {
		if plaintext == "" {
			return true // Skip empty strings
		}

		encrypted, err := Encrypt(plaintext, key)
		if err != nil {
			t.Logf("Encryption error: %v", err)
			return false
		}

		// Property: encrypted value must not equal plaintext
		return encrypted != plaintext
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// TestEncryptDecryptRoundTrip verifies that decrypt(encrypt(x)) == x
func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := []byte("test-encryption-key-32-bytes-ok!")

	f := func(plaintext string) bool {
		encrypted, err := Encrypt(plaintext, key)
		if err != nil {
			t.Logf("Encryption error: %v", err)
			return false
		}

		decrypted, err := Decrypt(encrypted, key)
		if err != nil {
			t.Logf("Decryption error: %v", err)
			return false
		}

		// Property: round-trip must preserve original value
		return decrypted == plaintext
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// TestEncryptionDifferentOutputs verifies that same plaintext produces different ciphertexts
// (due to random nonce)
func TestEncryptionDifferentOutputs(t *testing.T) {
	key := []byte("test-encryption-key-32-bytes-ok!")
	plaintext := "test-secret-value"

	encrypted1, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("First encryption failed: %v", err)
	}

	encrypted2, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Second encryption failed: %v", err)
	}

	// Due to random nonce, same plaintext should produce different ciphertexts
	if encrypted1 == encrypted2 {
		t.Error("Same plaintext produced identical ciphertexts - nonce may not be random")
	}

	// But both should decrypt to the same value
	decrypted1, _ := Decrypt(encrypted1, key)
	decrypted2, _ := Decrypt(encrypted2, key)

	if decrypted1 != plaintext || decrypted2 != plaintext {
		t.Error("Decryption did not produce original plaintext")
	}
}

// TestPasswordHashNotEqualPlaintext verifies that hashed password is different from plaintext
func TestPasswordHashNotEqualPlaintext(t *testing.T) {
	f := func(password string) bool {
		if password == "" {
			return true // Skip empty strings
		}
		// bcrypt has a 72 byte limit, truncate for testing
		if len(password) > 72 {
			password = password[:72]
		}

		hash, err := HashPassword(password)
		if err != nil {
			t.Logf("Hash error: %v", err)
			return false
		}

		// Property: hash must not equal plaintext
		return hash != password
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// TestPasswordHashVerification verifies that CheckPassword works correctly
func TestPasswordHashVerification(t *testing.T) {
	f := func(password string) bool {
		if password == "" {
			return true // Skip empty strings
		}
		// bcrypt has a 72 byte limit, truncate for testing
		if len(password) > 72 {
			password = password[:72]
		}

		hash, err := HashPassword(password)
		if err != nil {
			t.Logf("Hash error: %v", err)
			return false
		}

		// Property: correct password should verify
		return CheckPassword(password, hash)
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Errorf("Property test failed: %v", err)
	}
}

// TestWrongPasswordFails verifies that wrong password fails verification
func TestWrongPasswordFails(t *testing.T) {
	password := "correct-password"
	wrongPassword := "wrong-password"

	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("Hash error: %v", err)
	}

	if CheckPassword(wrongPassword, hash) {
		t.Error("Wrong password should not verify")
	}
}

// TestDecryptWithWrongKeyFails verifies that decryption with wrong key fails
func TestDecryptWithWrongKeyFails(t *testing.T) {
	key1 := []byte("correct-key-32-bytes-long-ok!!!")
	key2 := []byte("wrong-key-32-bytes-long-ok!!!!!!")
	plaintext := "secret-data"

	encrypted, err := Encrypt(plaintext, key1)
	if err != nil {
		t.Fatalf("Encryption failed: %v", err)
	}

	_, err = Decrypt(encrypted, key2)
	if err == nil {
		t.Error("Decryption with wrong key should fail")
	}
}
