package main

import "net/http"

// handleMeta is an unauthenticated service descriptor used by the status
// dashboard and the mobile app's bootstrap call. It was meant to report
// only the API version, but accreted a few service-mesh details that the
// telematics provider-sync integration relies on.
func handleMeta(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"product": "Meridian Fleet API",
		"api":     "v1",
		"version": "1.9.4",
		"services": map[string]any{
			"database":      "sqlite",
			"provider_sync": "enabled",
			// Internal provider-sync metadata endpoint. Server-side only.
			"metadata": "http://provider-metadata.meridian.local:8099/",
		},
	})
}
