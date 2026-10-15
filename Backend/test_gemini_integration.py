import unittest
from unittest.mock import patch, MagicMock
import json
import os
import sys

# Ensure Backend directory is in sys.path
backend_dir = os.path.abspath(os.path.dirname(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from google.genai.errors import APIError
from ai_logic import (
    MODEL_APTITUDE_QUESTION,
    MODEL_TECHNICAL_QUESTION,
    MODEL_APTITUDE_FEEDBACK,
    MODEL_CHATBOT,
    MODEL_INTERVIEW,
    MODEL_COMMUNICATION,
    MODEL_COMMUNICATION_TOPIC,
    MODEL_MANAGERIAL,
    MODEL_HR,
    MODEL_RESUME,
    MODEL_FINAL_REPORT,
    FALLBACK_FLASH,
    FALLBACK_LITE,
    AptitudeQuestionSchema,
    TechnicalQuestionSchema,
    CommunicationTopicSchema,
    clean_and_parse_json,
    generate_content_with_retry,
    get_aptitude_question,
    get_aptitude_feedback,
    get_technical_question,
    generate_communication_topic,
    generate_ai_question,
)
from app import app


class TestModelConfiguration(unittest.TestCase):
    """Verifies that all models match the verified official Gemini model IDs."""

    def test_model_constants(self):
        self.assertEqual(MODEL_APTITUDE_QUESTION, "gemini-3.5-flash-lite")
        self.assertEqual(MODEL_TECHNICAL_QUESTION, "gemini-3.8-flash")
        self.assertEqual(MODEL_APTITUDE_FEEDBACK, "gemini-3.8-flash")
        self.assertEqual(MODEL_CHATBOT, "gemini-3.8-flash")
        self.assertEqual(MODEL_INTERVIEW, "gemini-3.8-flash")
        self.assertEqual(MODEL_COMMUNICATION, "gemini-3.8-flash")
        self.assertEqual(MODEL_COMMUNICATION_TOPIC, "gemini-3.5-flash-lite")
        self.assertEqual(MODEL_MANAGERIAL, "gemini-3.8-flash")
        self.assertEqual(MODEL_HR, "gemini-3.8-flash")
        self.assertEqual(MODEL_RESUME, "gemini-3.8-flash")
        self.assertEqual(MODEL_FINAL_REPORT, "gemini-3.8-flash")

    def test_fallbacks_defined(self):
        self.assertEqual(FALLBACK_FLASH, "gemini-3.8-flash")
        self.assertEqual(FALLBACK_LITE, "gemini-3.5-flash-lite")

    def test_no_obsolete_model_references(self):
        """Verifies that no legacy model references remain in ai_logic.py and app.py."""
        for filename in ["ai_logic.py", "app.py"]:
            filepath = os.path.join(backend_dir, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
                self.assertNotIn("gemini-2.5-flash", content, f"Found gemini-2.5-flash in {filename}")
                self.assertNotIn("gemini-2.5-flash-lite", content, f"Found gemini-2.5-flash-lite in {filename}")
                self.assertNotIn("gemini-1.5-flash", content, f"Found gemini-1.5-flash in {filename}")
                self.assertNotIn("gemini-1.5-pro", content, f"Found gemini-1.5-pro in {filename}")


class TestStructuredOutputValidation(unittest.TestCase):
    """Verifies structured output Pydantic schemas and JSON parsing."""

    def test_clean_and_parse_json_raw(self):
        raw = '{"question": "What is 2+2?", "options": ["A) 1", "B) 2", "C) 3", "D) 4"], "correct_answer": "D) 4", "solution": "2+2=4"}'
        parsed = clean_and_parse_json(raw)
        self.assertEqual(parsed["question"], "What is 2+2?")
        self.assertEqual(len(parsed["options"]), 4)

    def test_clean_and_parse_json_with_markdown_fences(self):
        raw = '```json\n{"question": "What is 2+2?", "options": ["A) 1", "B) 2", "C) 3", "D) 4"], "correct_answer": "D) 4", "solution": "2+2=4"}\n```'
        parsed = clean_and_parse_json(raw)
        self.assertEqual(parsed["correct_answer"], "D) 4")

    def test_clean_and_parse_json_empty_raises(self):
        with self.assertRaises(ValueError):
            clean_and_parse_json("")
        with self.assertRaises(ValueError):
            clean_and_parse_json("   ")

    def test_aptitude_schema_validation(self):
        valid_dict = {
            "question": "If x=2, what is 3x?",
            "options": ["A) 2", "B) 4", "C) 6", "D) 8"],
            "correct_answer": "C) 6",
            "solution": "3 * 2 = 6"
        }
        validated = AptitudeQuestionSchema.model_validate(valid_dict).model_dump()
        self.assertEqual(validated["correct_answer"], "C) 6")
        self.assertEqual(len(validated["options"]), 4)

    def test_technical_schema_validation(self):
        valid_dict = {
            "question_title": "Two Sum",
            "problem_statement": "Find two indices that sum to target.",
            "starter_code": "def solve(): pass",
            "test_cases": [{"stdin": "2 7 11 15\n9", "expected_output": "0 1"}],
            "model_solution": "def solve(): return [0, 1]"
        }
        validated = TechnicalQuestionSchema.model_validate(valid_dict).model_dump()
        self.assertEqual(validated["question_title"], "Two Sum")
        self.assertEqual(len(validated["test_cases"]), 1)

    def test_communication_topic_schema_validation(self):
        valid_dict = {"topic": "Discuss the impact of remote work."}
        validated = CommunicationTopicSchema.model_validate(valid_dict).model_dump()
        self.assertEqual(validated["topic"], "Discuss the impact of remote work.")


class TestAIFunctionsWithMocks(unittest.TestCase):
    """Verifies AI request behavior, error handling, 503 high-demand handling, and bounded retries."""

    @patch("ai_logic.client.models.generate_content")
    def test_aptitude_question_success(self, mock_gen):
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "question": "What is 15% of 200?",
            "options": ["A) 20", "B) 30", "C) 40", "D) 50"],
            "correct_answer": "B) 30",
            "solution": "0.15 * 200 = 30"
        })
        mock_gen.return_value = mock_response

        res = get_aptitude_question("Percentages")
        self.assertNotIn("error", res)
        self.assertEqual(res["question"], "What is 15% of 200?")
        self.assertEqual(len(res["options"]), 4)
        self.assertEqual(res["correct_answer"], "B) 30")

    @patch("ai_logic.client.models.generate_content")
    def test_aptitude_question_malformed_json_handled_safely(self, mock_gen):
        mock_response = MagicMock()
        mock_response.text = "This is not valid JSON at all."
        mock_gen.return_value = mock_response

        res = get_aptitude_question("Percentages")
        self.assertIn("error", res)
        self.assertIn("invalid or incomplete", res["error"].lower())

    @patch("ai_logic.client.models.generate_content")
    def test_aptitude_question_empty_response_handled_safely(self, mock_gen):
        mock_response = MagicMock()
        mock_response.text = ""
        mock_gen.return_value = mock_response

        res = get_aptitude_question("Percentages")
        self.assertIn("error", res)

    @patch("ai_logic.client.models.generate_content")
    def test_aptitude_question_503_fallback(self, mock_gen):
        """When the primary model gemini-3.5-flash-lite hits 503, it falls back to gemini-3.8-flash."""
        err_response = MagicMock()
        err_response.status_code = 503
        err_response.headers = {}
        err_response.json.return_value = {"error": {"code": 503, "message": "Model is overloaded"}}
        api_err_503 = APIError(503, "This model is currently experiencing high demand.", err_response)

        success_response = MagicMock()
        success_response.text = json.dumps({
            "question": "Fallback question",
            "options": ["A) 1", "B) 2", "C) 3", "D) 4"],
            "correct_answer": "A) 1",
            "solution": "Step by step"
        })

        # First call (primary) raises 503, second call (fallback) succeeds
        mock_gen.side_effect = [api_err_503, success_response]

        res = get_aptitude_question("Mix")
        self.assertNotIn("error", res)
        self.assertEqual(res["question"], "Fallback question")
        self.assertEqual(mock_gen.call_count, 2)
        # Verify first call used primary model and second call used fallback model
        self.assertEqual(mock_gen.call_args_list[0].kwargs["model"], MODEL_APTITUDE_QUESTION)
        self.assertEqual(mock_gen.call_args_list[1].kwargs["model"], FALLBACK_FLASH)

    @patch("ai_logic.client.models.generate_content")
    def test_aptitude_question_503_exhaustion_controlled_error(self, mock_gen):
        """When 503 persists across fallback, returns safe high-demand message."""
        err_response = MagicMock()
        err_response.status_code = 503
        err_response.headers = {}
        err_response.json.return_value = {"error": {"code": 503, "message": "High demand"}}
        api_err_503 = APIError(503, "Model overloaded", err_response)

        mock_gen.side_effect = api_err_503

        res = get_aptitude_question("Mix")
        self.assertIn("error", res)
        self.assertIn("high demand", res["error"].lower())

    @patch("ai_logic.client.models.generate_content")
    def test_rate_limit_429_handled_safely(self, mock_gen):
        err_response = MagicMock()
        err_response.status_code = 429
        err_response.headers = {}
        err_response.json.return_value = {"error": {"code": 429, "message": "Quota exceeded"}}
        api_err_429 = APIError(429, "Quota exceeded", err_response)

        mock_gen.side_effect = api_err_429

        res = get_aptitude_question("Mix")
        self.assertIn("error", res)
        self.assertIn("rate limit", res["error"].lower())

    @patch("ai_logic.client.models.generate_content")
    def test_auth_401_fails_without_retry(self, mock_gen):
        err_response = MagicMock()
        err_response.status_code = 401
        err_response.headers = {}
        err_response.json.return_value = {"error": {"code": 401, "message": "Invalid API Key"}}
        api_err_401 = APIError(401, "API key not valid", err_response)

        mock_gen.side_effect = api_err_401

        res = get_aptitude_question("Mix")
        self.assertIn("error", res)
        self.assertIn("authentication", res["error"].lower())
        # Permanent errors should not trigger fallback
        self.assertEqual(mock_gen.call_count, 1)

    @patch("ai_logic.client.models.generate_content")
    def test_get_technical_question_success(self, mock_gen):
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "question_title": "Reverse Linked List",
            "problem_statement": "Reverse a singly linked list.",
            "starter_code": "def reverseList(head): pass",
            "test_cases": [{"stdin": "[1,2,3]", "expected_output": "[3,2,1]"}],
            "model_solution": "def reverseList(head): return head"
        })
        mock_gen.return_value = mock_response

        res = get_technical_question("Linked Lists", "python")
        self.assertNotIn("error", res)
        self.assertEqual(res["question_title"], "Reverse Linked List")
        self.assertEqual(len(res["test_cases"]), 1)

    @patch("ai_logic.client.models.generate_content")
    def test_generate_communication_topic_success(self, mock_gen):
        mock_response = MagicMock()
        mock_response.text = json.dumps({"topic": "Describe your proudest technical achievement."})
        mock_gen.return_value = mock_response

        res = generate_communication_topic()
        self.assertNotIn("error", res)
        self.assertEqual(res["topic"], "Describe your proudest technical achievement.")

    @patch("ai_logic.client.models.generate_content")
    def test_get_aptitude_feedback_success(self, mock_gen):
        mock_response = MagicMock()
        mock_response.text = "### OVERALL SUMMARY\nGreat job!\n### STRONGEST TOPIC\nMath\n### WEAKEST TOPIC\nNone\n### KEY TAKEAWAY\nKeep going!"
        mock_gen.return_value = mock_response

        results = [{"topic": "Math", "question": "Q1", "user_answer": "A", "correct_answer": "A", "is_correct": True, "time_taken_seconds": 10}]
        feedback = get_aptitude_feedback(results)
        self.assertIn("OVERALL SUMMARY", feedback)


class TestFlaskEndpoints(unittest.TestCase):
    """Verifies Flask endpoint request validation, response structure, and HTTP status codes."""

    def setUp(self):
        self.client = app.test_client()

    def test_aptitude_question_missing_topic(self):
        res = self.client.post("/aptitude-question", json={})
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

    @patch("app.get_aptitude_question")
    def test_aptitude_question_success(self, mock_func):
        mock_func.return_value = {
            "question": "What is 10 + 10?",
            "options": ["A) 10", "B) 20", "C) 30", "D) 40"],
            "correct_answer": "B) 20",
            "solution": "10 + 10 = 20"
        }
        res = self.client.post("/aptitude-question", json={"topic": "Mix"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["question"], "What is 10 + 10?")
        self.assertEqual(len(data["options"]), 4)

    @patch("app.get_aptitude_question")
    def test_aptitude_question_high_demand_returns_503(self, mock_func):
        mock_func.return_value = {"error": "The AI model is currently experiencing high demand. Please try again shortly."}
        res = self.client.post("/aptitude-question", json={"topic": "Mix"})
        self.assertEqual(res.status_code, 503)
        data = res.get_json()
        self.assertIn("high demand", data["error"])

    def test_aptitude_feedback_missing_results(self):
        res = self.client.post("/aptitude-feedback", json={})
        self.assertEqual(res.status_code, 400)

    @patch("app.get_aptitude_feedback")
    def test_aptitude_feedback_success(self, mock_func):
        mock_func.return_value = "### OVERALL SUMMARY\nWell done."
        res = self.client.post("/aptitude-feedback", json={"results": [{"is_correct": True}]})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("feedback", data)

    def test_technical_question_missing_fields(self):
        res = self.client.post("/technical-question", json={"topic": "Arrays"})
        self.assertEqual(res.status_code, 400)

    @patch("app.get_technical_question")
    def test_technical_question_success(self, mock_func):
        mock_func.return_value = {
            "question_title": "Palindrome",
            "problem_statement": "Check if string is palindrome.",
            "starter_code": "def is_palindrome(s): pass",
            "test_cases": [{"stdin": "racecar", "expected_output": "True"}],
            "model_solution": "def is_palindrome(s): return s == s[::-1]"
        }
        res = self.client.post("/technical-question", json={"topic": "Strings", "language": "python"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["question_title"], "Palindrome")

    def test_gemini_chat_missing_prompt(self):
        res = self.client.post("/api/gemini", json={})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Missing prompt", res.get_json()["error"])

    @patch("app.client.models.generate_content_stream")
    def test_gemini_chat_streaming(self, mock_stream):
        chunk1 = MagicMock()
        chunk1.text = "Hello! "
        chunk2 = MagicMock()
        chunk2.text = "How can I help you today?"
        mock_stream.return_value = [chunk1, chunk2]

        res = self.client.post("/api/gemini", json={"prompt": "Hello"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.mimetype, "text/event-stream")
        content = res.get_data(as_text=True)
        self.assertIn("data: Hello! \n\n", content)
        self.assertIn("data: How can I help you today?\n\n", content)
        self.assertIn("data: [DONE]\n\n", content)


if __name__ == "__main__":
    unittest.main()
