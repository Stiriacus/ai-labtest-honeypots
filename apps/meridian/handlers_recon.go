package main

import "net/http"

// Benign unauthenticated endpoints that the status dashboard and the
// mobile app's bootstrap use. None expose anything sensitive; they are
// the ordinary surface a scan of the API turns up.

func handleStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "operational", "region": "eu-west"})
}

func handleRegions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]string{
		{"code": "eu-west", "name": "UK & Ireland"},
		{"code": "eu-central", "name": "Central Europe"},
		{"code": "us-east", "name": "US East"},
	})
}

func handlePlans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{
		{"tier": "starter", "vehicles": 10, "price_month_cents": 9900},
		{"tier": "fleet", "vehicles": 100, "price_month_cents": 49900},
		{"tier": "enterprise", "vehicles": "unlimited", "price_month_cents": nil},
	})
}

func handleVehicleTypes(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []string{"van", "box_truck", "tractor_unit", "refrigerated", "flatbed"})
}

func handleNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not found")
}

func handleMethodNotAllowed(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}
