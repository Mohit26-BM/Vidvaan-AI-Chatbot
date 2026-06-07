import os
from dotenv import load_dotenv

load_dotenv()

_client = None


def _get_client():
    global _client
    if _client is None:
        try:
            from tavily import TavilyClient
        except ImportError:
            raise RuntimeError("tavily-python is not installed. Run: pip install tavily-python")
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key:
            raise RuntimeError("TAVILY_API_KEY is not set in environment")
        _client = TavilyClient(api_key=api_key)
    return _client


def search(query: str, max_results: int = 3) -> str:
    """Run a web search and return results as a formatted string for the AI."""
    client = _get_client()
    response = client.search(query, max_results=max_results, include_answer=True)

    parts = []

    if response.get("answer"):
        parts.append(f"Quick answer: {response['answer']}")

    for i, result in enumerate(response.get("results", []), 1):
        title   = result.get("title", "No title")
        url     = result.get("url", "")
        content = result.get("content", "")[:200]
        parts.append(f"[SOURCE {i}] {title}\nURL: {url}\n{content}")

    return "\n\n".join(parts)
