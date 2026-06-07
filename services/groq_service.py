import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


# Custom Exception Classes
class GroqAPIError(Exception):
    """Base exception for Groq API errors"""

    pass


class RateLimitError(GroqAPIError):
    """Raised when rate limit is exceeded"""

    pass


class AuthenticationError(GroqAPIError):
    """Raised when API key is invalid"""

    pass


class InvalidRequestError(GroqAPIError):
    """Raised when request is malformed"""

    pass


# Initialize Groq client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


_BASE_SYSTEM_CONTENT = (
    "You are Vidvaan, a personal AI assistant. If asked who you are, say you are Vidvaan.\n\n"
    "You have a web_search tool. You MUST call it (do not answer from memory) whenever "
    "the user asks about: current weather, live scores, stock prices, news, events, "
    "exchange rates, or anything else that requires up-to-date real-world data. "
    "Never say you cannot access real-time data — use the tool instead.\n"
    "When you use web_search results, always end your response with a **Sources** section "
    "listing each source as a markdown link: [Title](url). Only list sources you actually used.\n\n"
    "Format your responses using Markdown:\n"
    "- Use **bold** and *italic* for emphasis\n"
    "- Use fenced code blocks with language tags (```python, ```js, etc.) for all code\n"
    "- Use headers (##, ###) to structure long answers\n"
    "- Use bullet lists and numbered lists where appropriate\n"
    "- Use `inline code` for variable names, commands, and short snippets\n"
    "- Use > blockquotes for notes or warnings\n"
    "Be concise but thorough. Never apologize unnecessarily."
)

SYSTEM_PROMPT = {"role": "system", "content": _BASE_SYSTEM_CONTENT}


def _build_system(custom_instructions=None):
    content = _BASE_SYSTEM_CONTENT
    if custom_instructions and custom_instructions.strip():
        content += f"\n\n---\nAbout the user (follow these preferences):\n{custom_instructions.strip()}"
    return {"role": "system", "content": content}


def get_response(messages, custom_instructions=None):
    """
    Get a response from Groq API with proper error handling.

    Returns:
        Tuple of (reply: str, usage: dict) where usage contains rate-limit headers.

    Raises:
        RateLimitError, AuthenticationError, InvalidRequestError, GroqAPIError
    """
    try:
        raw = client.chat.completions.with_raw_response.create(
            model="llama-3.1-8b-instant",
            messages=[_build_system(custom_instructions)] + messages,
            temperature=0.7,
            max_tokens=2048,
        )
        completion = raw.parse()
        content = completion.choices[0].message.content

        usage = {
            "remaining_requests": raw.headers.get("x-ratelimit-remaining-requests"),
            "remaining_tokens":   raw.headers.get("x-ratelimit-remaining-tokens"),
            "limit_requests":     raw.headers.get("x-ratelimit-limit-requests"),
            "limit_tokens":       raw.headers.get("x-ratelimit-limit-tokens"),
            "reset_requests":     raw.headers.get("x-ratelimit-reset-requests"),
            "reset_tokens":       raw.headers.get("x-ratelimit-reset-tokens"),
        }
        return content, usage

    except Exception as e:
        error_message = str(e).lower()

        # Check for rate limit errors
        if (
            "rate_limit" in error_message
            or "429" in error_message
            or "too many requests" in error_message
        ):
            raise RateLimitError(
                "Rate limit exceeded. Please wait a few moments before trying again."
            )

        # Check for authentication errors
        elif (
            "authentication" in error_message
            or "401" in error_message
            or "api key" in error_message
        ):
            raise AuthenticationError(
                "API authentication failed. Please check your API key."
            )

        # Check for invalid request errors
        elif (
            "invalid" in error_message
            or "400" in error_message
            or "bad request" in error_message
        ):
            raise InvalidRequestError(
                "The request was invalid. Please try rephrasing your message."
            )

        # Check for service unavailable
        elif "503" in error_message or "service unavailable" in error_message:
            raise GroqAPIError(
                "The AI service is temporarily unavailable. Please try again in a moment."
            )

        # Check for timeout errors
        elif "timeout" in error_message or "timed out" in error_message:
            raise GroqAPIError("The request timed out. Please try again.")

        # Generic API error
        else:
            raise GroqAPIError(
                f"An error occurred while communicating with the AI: {str(e)}"
            )


SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the internet for current, real-time information. "
            "Use this when the user asks about recent news, live prices, sports scores, "
            "current weather, events after your knowledge cutoff, or anything that requires "
            "up-to-date data. Do NOT use it for general knowledge questions you can answer directly."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "A concise, optimised search query",
                }
            },
            "required": ["query"],
        },
    },
}


def detect_tool_call(messages, tools, custom_instructions=None):
    """
    Non-streaming call with tools to detect if the model wants to call a function.
    Uses a small/fast model (500K tokens/day) just for routing decisions so the
    large 70B model's 100K daily budget is spent only on actual responses.
    Returns (usage_dict, choice).
    """
    raw = client.chat.completions.with_raw_response.create(
        model="llama-3.1-8b-instant",
        messages=[_build_system(custom_instructions)] + messages,
        temperature=0,
        max_tokens=256,
        tools=tools,
        tool_choice="auto",
    )
    usage = extract_usage_headers(raw.headers)
    completion = raw.parse()
    return usage, completion.choices[0]


def create_stream(messages, tools=None, custom_instructions=None):
    """Return a streaming response context manager for the Groq API."""
    kwargs = dict(
        model="llama-3.1-8b-instant",
        messages=[_build_system(custom_instructions)] + messages,
        temperature=0.7,
        max_tokens=2048,
        stream=True,
    )
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    return client.chat.completions.with_streaming_response.create(**kwargs)


def extract_usage_headers(headers):
    return {
        "remaining_requests": headers.get("x-ratelimit-remaining-requests"),
        "remaining_tokens":   headers.get("x-ratelimit-remaining-tokens"),
        "limit_requests":     headers.get("x-ratelimit-limit-requests"),
        "limit_tokens":       headers.get("x-ratelimit-limit-tokens"),
        "reset_requests":     headers.get("x-ratelimit-reset-requests"),
        "reset_tokens":       headers.get("x-ratelimit-reset-tokens"),
    }


def validate_api_key():
    """
    Validate that API key exists and is set

    Returns:
        Boolean indicating if API key is valid
    """
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key == "":
        return False
    return True


def test_connection():
    """
    Test the connection to Groq API

    Returns:
        Tuple of (success: bool, message: str)
    """
    if not validate_api_key():
        return False, "API key is not set"

    try:
        test_messages = [{"role": "user", "content": "Hi"}]
        get_response(test_messages)
        return True, "Connection successful"
    except Exception as e:
        return False, str(e)
