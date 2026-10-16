import unittest
from unittest.mock import patch, MagicMock
import os
import sys
import tempfile

# Ensure Backend directory is in sys.path
backend_dir = os.path.abspath(os.path.dirname(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai_logic import get_ffmpeg_cmd, transcribe_audio_to_text
from app import app


class TestAudioTranscriptionAndFFmpeg(unittest.TestCase):
    """Verifies FFmpeg discovery, fallback handling, and transcription pipeline."""

    def test_ffmpeg_cmd_detection(self):
        """Verify that get_ffmpeg_cmd returns a valid binary or None safely without throwing."""
        cmd = get_ffmpeg_cmd()
        # On this environment ffmpeg is installed, so it should find a string
        if cmd:
            self.assertIsInstance(cmd, str)
            self.assertTrue(os.path.exists(cmd))

    def test_transcribe_missing_api_key(self):
        """Should fail gracefully if ASSEMBLYAI_API_KEY is not set."""
        with patch.dict(os.environ, {"ASSEMBLYAI_API_KEY": ""}, clear=False):
            # Also clear if present
            if "ASSEMBLYAI_API_KEY" in os.environ:
                del os.environ["ASSEMBLYAI_API_KEY"]
            res, duration = transcribe_audio_to_text("dummy.webm")
            self.assertIn("Error:", res)
            self.assertIn("AssemblyAI API key missing", res)
            self.assertEqual(duration, 0)

    def test_transcribe_empty_or_nonexistent_file(self):
        """Should return error if the audio file does not exist or is empty."""
        with patch.dict(os.environ, {"ASSEMBLYAI_API_KEY": "fake_test_key"}):
            res, duration = transcribe_audio_to_text("nonexistent_test_audio_12345.webm")
            self.assertIn("Error:", res)
            self.assertEqual(duration, 0)

    @patch("requests.post")
    @patch("requests.get")
    def test_transcribe_successful_flow_with_fallback(self, mock_get, mock_post):
        """Test complete upload -> transcribe -> poll flow with mocked AssemblyAI responses."""
        with patch.dict(os.environ, {"ASSEMBLYAI_API_KEY": "fake_test_key"}):
            # Create a dummy audio file with some bytes
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
                f.write(b"\x1a\x45\xdf\xa3dummy_webm_bytes_data_123456789")
                temp_audio = f.name

            try:
                # Mock AssemblyAI upload response
                mock_upload_resp = MagicMock()
                mock_upload_resp.status_code = 200
                mock_upload_resp.json.return_value = {"upload_url": "https://cdn.assemblyai.com/test_audio.wav"}

                # Mock AssemblyAI transcript creation response
                mock_trans_resp = MagicMock()
                mock_trans_resp.status_code = 200
                mock_trans_resp.json.return_value = {"id": "mock_transcript_id_123"}

                mock_post.side_effect = [mock_upload_resp, mock_trans_resp]

                # Mock AssemblyAI polling response
                mock_poll_resp = MagicMock()
                mock_poll_resp.status_code = 200
                mock_poll_resp.json.return_value = {
                    "status": "completed",
                    "text": "Hello world, I am testing transcription.",
                    "audio_duration": 4.5
                }
                mock_get.return_value = mock_poll_resp

                transcript, duration = transcribe_audio_to_text(temp_audio)

                self.assertEqual(transcript, "Hello world, I am testing transcription.")
                self.assertEqual(duration, 4.5)
            finally:
                if os.path.exists(temp_audio):
                    os.remove(temp_audio)

    @patch("requests.post")
    @patch("requests.get")
    def test_transcribe_without_ffmpeg_falls_back_to_raw_audio(self, mock_get, mock_post):
        """Verify that when FFmpeg is not found (None), it uploads raw webm without crashing."""
        with patch.dict(os.environ, {"ASSEMBLYAI_API_KEY": "fake_test_key"}):
            with patch("ai_logic.get_ffmpeg_cmd", return_value=None):
                with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
                    f.write(b"raw_webm_audio_without_ffmpeg")
                    temp_audio = f.name

                try:
                    mock_upload_resp = MagicMock()
                    mock_upload_resp.status_code = 200
                    mock_upload_resp.json.return_value = {"upload_url": "https://cdn.assemblyai.com/raw.webm"}

                    mock_trans_resp = MagicMock()
                    mock_trans_resp.status_code = 200
                    mock_trans_resp.json.return_value = {"id": "mock_id_456"}

                    mock_post.side_effect = [mock_upload_resp, mock_trans_resp]

                    mock_poll_resp = MagicMock()
                    mock_poll_resp.status_code = 200
                    mock_poll_resp.json.return_value = {
                        "status": "completed",
                        "text": "Direct webm transcription without ffmpeg worked.",
                        "audio_duration": 3.2
                    }
                    mock_get.return_value = mock_poll_resp

                    transcript, duration = transcribe_audio_to_text(temp_audio)

                    self.assertEqual(transcript, "Direct webm transcription without ffmpeg worked.")
                    self.assertEqual(duration, 3.2)
                    # Verify raw bytes were sent to upload endpoint
                    upload_call_args = mock_post.call_args_list[0]
                    self.assertEqual(upload_call_args.kwargs["data"], b"raw_webm_audio_without_ffmpeg")
                finally:
                    if os.path.exists(temp_audio):
                        os.remove(temp_audio)

    def test_health_endpoint(self):
        """Verify that /api/health returns system and ffmpeg status."""
        client = app.test_client()
        resp = client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("ffmpeg_available", data)
        self.assertIn("ffmpeg_path", data)

    @patch("app.transcribe_audio_to_text")
    @patch("app.get_ai_response")
    def test_interview_endpoint_complete_flow(self, mock_get_ai, mock_transcribe):
        """Test recording -> transcription -> answer analysis for /interview."""
        mock_transcribe.return_value = ("My leadership experience taught me to prioritize team collaboration.", 12)
        mock_get_ai.return_value = "### Feedback\nGreat response, well structured!"

        import io
        client = app.test_client()
        data = {
            "question": "Tell me about a leadership challenge.",
            "expressions": "[\"Happy\", \"Neutral\"]",
            "audio_file": (io.BytesIO(b"fake_audio_stream"), "recording.webm")
        }
        resp = client.post("/interview", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 200)
        json_resp = resp.get_json()
        self.assertIn("feedback", json_resp)
        self.assertEqual(json_resp["feedback"], "### Feedback\nGreat response, well structured!")
        mock_transcribe.assert_called_once()
        mock_get_ai.assert_called_once()

    @patch("app.transcribe_audio_to_text")
    @patch("app.get_communication_feedback")
    def test_communication_endpoint_complete_flow(self, mock_comm_fb, mock_transcribe):
        """Test recording -> transcription -> answer analysis for /communication-feedback."""
        mock_transcribe.return_value = ("The importance of reading books is that it expands knowledge.", 15)
        mock_comm_fb.return_value = "### Overall Summary\nClear delivery with good cadence."

        import io
        client = app.test_client()
        data = {
            "question": "The benefits of reading books",
            "expressions": "[\"Neutral\"]",
            "audio_file": (io.BytesIO(b"fake_audio_stream"), "recording.webm")
        }
        resp = client.post("/communication-feedback", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 200)
        json_resp = resp.get_json()
        self.assertIn("feedback", json_resp)
        self.assertEqual(json_resp["feedback"], "### Overall Summary\nClear delivery with good cadence.")

    @patch("app.transcribe_audio_to_text")
    @patch("app.get_hr_response")
    def test_hr_conversation_endpoint_complete_flow(self, mock_hr_resp, mock_transcribe):
        """Test recording -> transcription -> answer analysis for /hr-conversation."""
        mock_transcribe.return_value = ("I handle conflict through active listening and compromise.", 10)
        mock_hr_resp.return_value = {
            "ai_response": "That demonstrates strong emotional intelligence. What was the outcome?",
            "user_transcript": "I handle conflict through active listening and compromise.",
            "updated_history": [
                {"role": "user", "content": "I handle conflict through active listening and compromise."},
                {"role": "ai", "content": "That demonstrates strong emotional intelligence. What was the outcome?"}
            ],
            "session_complete": False
        }

        import io
        client = app.test_client()
        data = {
            "conversation_history": '[{"role": "ai", "content": "How do you handle conflict?"}]',
            "expressions": "[\"Neutral\"]",
            "audio_file": (io.BytesIO(b"fake_audio_stream"), "recording.webm")
        }
        resp = client.post("/hr-conversation", data=data, content_type="multipart/form-data")
        self.assertEqual(resp.status_code, 200)
        json_resp = resp.get_json()
        self.assertIn("ai_response", json_resp)
        self.assertIn("user_transcript", json_resp)
        self.assertEqual(json_resp["user_transcript"], "I handle conflict through active listening and compromise.")


if __name__ == "__main__":
    unittest.main()
