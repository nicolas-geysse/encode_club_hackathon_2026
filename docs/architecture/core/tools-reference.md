# MCP Tools Reference

This document describes the currently implemented MCP Tools available in the `mcp-server`.

## 1. Prospection Tools (`tools/prospection.ts`)

These tools power the "Find Jobs" and "Map" features.

### `search_nearby_jobs`
*   **Description**: Finds suitable student job locations using Google Places API.
*   **Categories**: `service`, `retail`, `cleaning`, `handyman`, `childcare`, `tutoring`, `events`, `interim`, `digital`, `campus`.
*   **Output**: List of nearby places with names, addresses, ratings, and open status.
*   **Logic**: Maps Categories -> Google Place Types (e.g., 'service' -> 'restaurant', 'cafe').

### `calculate_commute`
*   **Description**: Calculates transit times between user and destinations via Google Distance Matrix API.
*   **Inputs**: Origin (User Lat/Lng), Destinations (Array), Mode (default: `transit`).
*   **Output**: Distance text and Duration text for each destination.

### `search_job_offers`
*   **Description**: Generates *real*, clickable search URLs for major job platforms.
*   **Platforms**: Indeed, LinkedIn, StudentJob, HelloWork, Pôle Emploi, Jobijoba.
*   **Behavior**: Does NOT scrape job details directly (avoiding TOS issues). Instead, returns deep links to pre-filled search queries on these platforms.

## 2. Google Maps Service (`services/google-maps.ts`)

Shared service layer for interacting with Google APIs.
*   **env**: Requires `GOOGLE_MAPS_API_KEY`.
*   **Functions**:
    *   `findNearbyPlaces`: Wrapper for Places API Nearby Search.
    *   `getDistanceMatrix`: Wrapper for Distance Matrix API.

## 3. Discrepancies vs Legacy Docs
*   **Mastra Workflows**: The legacy `find-jobs.md` described a `job-prospection` workflow that chained scraping + enrichment. The current implementation uses direct Tool execution (`search_job_offers` for links, `search_nearby_jobs` for places) to ensure reliability and speed, avoiding complex scraping pipelines for the MVP.
