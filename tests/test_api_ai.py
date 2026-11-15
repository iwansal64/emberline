"""Tests for the AI satellite telemetry context analyzer endpoint (POST /api/ai/analyze-hotspot)."""
import json
import unittest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from api.app import app, _analyze_hotspot_heuristic, _call_grok_hotspot_analysis


class TestAIHotspotAnalyzer(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_heuristic_reports_metadata_without_inferencing_local_conditions(self):
        res = _analyze_hotspot_heuristic(
            lat=0.73494,
            lon=102.88028,
            date="2017-09-28",
            frp=69.52,
            sensor="viirs",
            conf="h",
            daynight="N",
            region="Riau",
        )
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["provider"], "heuristic")
        self.assertIn("0.73494", res["analysis"])
        self.assertIn("102.88028", res["analysis"])
        self.assertIn("Riau", res["analysis"])
        self.assertIn("belum diverifikasi", res["analysis"])
        self.assertIn("tidak menentukan penyebab", res["analysis"])
        self.assertEqual(res["telemetry_context"]["biome"], "Tidak dinilai dari rekaman ini.")
        self.assertEqual(res["telemetry_context"]["peatland_susceptibility"], "Tidak dinilai dari rekaman ini.")
        self.assertIn("69.52 MW", res["telemetry_context"]["frp_interpretation"])

    def test_api_endpoint_success_heuristic_fallback(self):
        with patch("api.app._get_grok_key", return_value=(None, "heuristic")):
            resp = self.client.post("/api/ai/analyze-hotspot", json={
                "lat": -1.8,
                "lon": 113.8,
                "date": "2019-09-15",
                "frp": 35.4,
                "sensor": "viirs",
                "conf": "h",
                "daynight": "D",
                "question": "Apakah ini lahan gambut?"
            })
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["provider"], "heuristic")
            self.assertIn("-1.80000", data["analysis"])
            self.assertIn("113.80000", data["analysis"])
            self.assertNotIn("Kalimantan Tengah", data["analysis"])
            self.assertIn("Tidak dinilai dari rekaman ini.", data["telemetry_context"]["biome"])
            self.assertIn("telemetry_context", data)

    def test_xai_uses_current_responses_api(self):
        response = MagicMock()
        response.read.return_value = json.dumps({"output_text": "xAI response"}).encode()
        with patch("api.app._get_grok_key", return_value=("xai-test-key", "grok")), \
             patch("api.app.urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value = response
            result = _call_grok_hotspot_analysis(
                lat=0.5,
                lon=101.5,
                date="2023-08-20",
                frp=15.2,
                sensor="viirs",
                conf="h",
                daynight="D",
                lang="en",
            )

        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.x.ai/v1/responses")
        self.assertEqual(json.loads(request.data)["model"], "grok-4.7")
        self.assertEqual(result["provider"], "grok")
        self.assertEqual(result["analysis"], "xAI response")

    def test_api_endpoint_bad_coordinates(self):
        resp = self.client.post("/api/ai/analyze-hotspot", json={
            "lat": "not-a-number",
            "lon": 102.0,
            "frp": 10.0
        })
        self.assertEqual(resp.status_code, 400)
        data = resp.json()
        self.assertEqual(data["detail"]["code"], "bad_coordinates")

    def test_api_endpoint_invalid_grok_key_graceful_fallback(self):
        resp = self.client.post("/api/ai/analyze-hotspot", json={
            "lat": 0.5,
            "lon": 101.5,
            "date": "2023-08-20",
            "frp": 15.2,
            "sensor": "modis",
            "conf": "80",
            "daynight": "D",
            "api_key": "invalid-dummy-key"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Should gracefully fall back to heuristic
        self.assertEqual(data["provider"], "heuristic")
        self.assertIn("ringkasan metadata", data["note"])

    def test_api_endpoint_english_language_support(self):
        with patch("api.app._get_grok_key", return_value=(None, "heuristic")):
            resp = self.client.post("/api/ai/analyze-hotspot", json={
                "lat": 0.73494,
                "lon": 102.88028,
                "date": "2017-09-28",
                "frp": 69.52,
                "sensor": "viirs",
                "conf": "h",
                "daynight": "N",
                "question": "why was this hotspot detected?",
                "lang": "en",
            })
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["provider"], "heuristic")
            self.assertIn("Coordinates: 0.73494°, 102.88028°", data["analysis"])
            self.assertIn("establish its cause", data["analysis"])
            self.assertEqual(data["telemetry_context"]["biome"], "Not assessed from this record.")
            self.assertEqual(data["telemetry_context"]["seasonal_climate"], "No climate data supplied.")

    def test_api_endpoint_indonesian_language_default(self):
        with patch("api.app._get_grok_key", return_value=(None, "heuristic")):
            resp = self.client.post("/api/ai/analyze-hotspot", json={
                "lat": 0.73494,
                "lon": 102.88028,
                "date": "2017-09-28",
                "frp": 69.52,
                "sensor": "viirs",
                "conf": "h",
                "daynight": "N",
                "lang": "id",
            })
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "success")
            self.assertEqual(data["provider"], "heuristic")
            self.assertIn("0.73494", data["analysis"])
            self.assertIn("102.88028", data["analysis"])
            self.assertIn("tidak menentukan penyebab", data["analysis"])
            self.assertEqual(data["telemetry_context"]["biome"], "Tidak dinilai dari rekaman ini.")


if __name__ == "__main__":
    unittest.main()
