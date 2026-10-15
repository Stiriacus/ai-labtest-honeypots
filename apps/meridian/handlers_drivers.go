package main

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func handleListDrivers(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		me := driverFromCtx(r)
		rows, err := db.Query(
			`SELECT id, email, full_name, phone, pay_rate_cents, role FROM drivers WHERE fleet_id = ? ORDER BY full_name`,
			me.FleetID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "query failed")
			return
		}
		defer rows.Close()

		var out []map[string]any
		for rows.Next() {
			var id, pay int64
			var email, name, phone, role string
			rows.Scan(&id, &email, &name, &phone, &pay, &role)
			out = append(out, map[string]any{
				"id": id, "email": email, "full_name": name, "phone": phone, "role": role,
			})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func handleGetDriver(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}

		// Profile lookups are keyed by driver id for the mobile app's
		// "view teammate" screen, which any signed-in driver can open
		// from the fleet roster.
		row := db.QueryRow(
			`SELECT id, fleet_id, email, full_name, phone, pay_rate_cents, role FROM drivers WHERE id = ?`, id,
		)
		var d struct {
			ID, FleetID, Pay int64
			Email, Name, Phone, Role string
		}
		if err := row.Scan(&d.ID, &d.FleetID, &d.Email, &d.Name, &d.Phone, &d.Pay, &d.Role); err != nil {
			writeError(w, http.StatusNotFound, "driver not found")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"id": d.ID, "fleet_id": d.FleetID, "email": d.Email, "full_name": d.Name,
			"phone": d.Phone, "pay_rate_cents": d.Pay, "role": d.Role,
		})
	}
}

func handleUpdateDriver(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}

		var patch map[string]any
		if err := decodeJSON(r, &patch); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		// The mobile app PATCHes whichever fields the driver edited on
		// their profile screen (name, phone, sometimes role when HR
		// promotes someone from the same form), so the handler applies
		// the patch generically instead of a long allow-list that goes
		// stale every time a field is added to the app.
		cols := []string{}
		args := []any{}
		for _, field := range []string{"full_name", "phone", "email", "role", "fleet_id", "pay_rate_cents"} {
			if v, ok := patch[field]; ok {
				cols = append(cols, field+" = ?")
				args = append(args, v)
			}
		}
		if len(cols) == 0 {
			writeError(w, http.StatusBadRequest, "no updatable fields in request")
			return
		}

		query := "UPDATE drivers SET " + cols[0]
		for _, c := range cols[1:] {
			query += ", " + c
		}
		query += " WHERE id = ?"
		args = append(args, id)

		if _, err := db.Exec(query, args...); err != nil {
			writeError(w, http.StatusBadRequest, "update failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}
