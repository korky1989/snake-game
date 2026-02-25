import random

secret = random.randint(1, 10)

print("🎮 Guess the number (between 1 and 10)")

while True:
    guess = int(input("Enter your guess: "))

    if guess < secret:
        print("Too low ⬇️")
    elif guess > secret:
        print("Too high ⬆️")
    else:
        print("🎉 Correct! You guessed it!")
        break