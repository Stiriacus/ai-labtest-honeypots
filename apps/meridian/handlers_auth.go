package main

import (
	"database/sql"
	"net/http"
	"time"
)

type registerRequest struct {
	FleetID  int64  `json:"fleet_id"`
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
}

func handleRegister(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req registerRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Email == "" || req.Password == "" || req.FullName == "" || req.FleetID == 0 {
			writeError(w, http.StatusBadRequest, "email, password, full_name and fleet_id are required")
			return
		}

		hash, err := hashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not create account")
			return
		}

		// New hires usually onboard as plain drivers; dispatchers can
		// promote them afterwards through the driver profile endpoint.
		role := req.Role
		if role == "" {
			role = "driver"
		}

		res, err := db.Exec(
			`INSERT INTO drivers (fleet_id, email, password_hash, full_name, phone, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			req.FleetID, req.Email, hash, req.FullName, req.Phone, role, time.Now().Unix(),
		)
		if err != nil {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		driverID, _ := res.LastInsertId()

		token, err := createSession(db, driverID, r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not start session")
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{"id": driverID, "token": token})
	}
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func handleLogin(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req loginRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		row := db.QueryRow(`SELECT id, password_hash, fleet_id, full_name, role FROM drivers WHERE email = ?`, req.Email)
		var id, fleetID int64
		var hash, fullName, role string
		if err := row.Scan(&id, &hash, &fleetID, &fullName, &role); err != nil || !checkPassword(req.Password, hash) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}

		token, err := createSession(db, id, r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not start session")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"token": token,
			"driver": map[string]any{
				"id": id, "email": req.Email, "full_name": fullName, "role": role, "fleet_id": fleetID,
			},
		})
	}
}

func handleLogout(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Tokens are bearer credentials the client is expected to forget;
		// the server side record ages out with the rest of the session
		// table so this just confirms the client can drop it.
		writeJSON(w, http.StatusOK, map[string]string{"status": "logged out"})
	}
}

func handleWhoami(w http.ResponseWriter, r *http.Request) {
	d := driverFromCtx(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"id": d.ID, "email": d.Email, "full_name": d.FullName, "role": d.Role, "fleet_id": d.FleetID,
	})
}
