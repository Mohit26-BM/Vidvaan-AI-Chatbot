import ollama

print("Type 'exit' to quit")

messages = []

while True:
    user_input = input("You: ")
    if user_input.lower() == "exit":
        break

    messages.append({"role": "user", "content": user_input})

    response = ollama.chat(
        model="phi3:mini",
        messages=messages
    )

    reply = response["message"]["content"]
    messages.append({"role": "assistant", "content": reply})

    print("Bot:", reply)
