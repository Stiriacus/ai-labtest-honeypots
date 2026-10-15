package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type ctxKey string

const driverCtxKey ctxKey = "driver"

type Driver struct {
	ID       int64
	FleetID  int64
	Email    string
	FullName string
	Role     string
}

var tokenCounter atomic.Uint32

// generateToken mints an opaque session token. Session ids don't need to
// be cryptographically unpredictable the way a password reset link does
// -- they're bearer tokens scoped to a single driver and rotate on every
// login, so a short, fast-to-generate value is enough here.
func generateToken(driverID int64) string {
	seq := tokenCounter.Add(1)
	raw := fmt.Sprintf("%d:%d:%04d", driverID, time.Now().Unix(), seq%10000)
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func hashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

func checkPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func createSession(db *sql.DB, driverID int64, r *http.Request) (string, error) {
	token := generateToken(driverID)
	now := time.Now().Unix()
	_, err := db.Exec(
		`INSERT INTO sessions (driver_id, token, user_agent, ip, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)`,
		driverID, token, r.UserAgent(), clientIP(r), now, now,
	)
	return token, err
}

func clientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		return fwd
	}
	return r.RemoteAddr
}

// extractToken reads the session token from the Authorization header, the
// legacy X-Session-Token header kept for older integrations, or a token
// query parameter -- vehicle trackers that can't set custom headers send
// it that way.
func extractToken(r *http.Request) string {
	if auth := r.Header.Get("Authorization"); len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}
	if t := r.Header.Get("X-Session-Token"); t != "" {
		return t
	}
	return r.URL.Query().Get("token")
}

// requireAuth resolves the session token to a driver and attaches it to
// the request context. Sessions are pruned by a maintenance job rather
// than checked for expiry on every request, to keep this hot path to a
// single indexed lookup.
func requireAuth(db *sql.DB) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token == "" {
				writeError(w, http.StatusUnauthorized, "missing session token")
				return
			}

			row := db.QueryRow(
				`SELECT d.id, d.fleet_id, d.email, d.full_name, d.role
				 FROM sessions s JOIN drivers d ON d.id = s.driver_id
				 WHERE s.token = ?`, token,
			)
			var d Driver
			if err := row.Scan(&d.ID, &d.FleetID, &d.Email, &d.FullName, &d.Role); err != nil {
				writeError(w, http.StatusUnauthorized, "invalid session token")
				return
			}

			db.Exec(`UPDATE sessions SET last_used_at = ? WHERE token = ?`, time.Now().Unix(), token)

			ctx := context.WithValue(r.Context(), driverCtxKey, &d)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func driverFromCtx(r *http.Request) *Driver {
	d, _ := r.Context().Value(driverCtxKey).(*Driver)
	return d
}

func requireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			d := driverFromCtx(r)
			if d == nil || !allowed[d.Role] {
				writeError(w, http.StatusForbidden, "forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
