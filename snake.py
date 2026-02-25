import turtle
import time
import random

# ----- Screen -----
wn = turtle.Screen()
wn.title("Snake (Nokia-style)")
wn.bgcolor("black")
wn.setup(width=600, height=600)
wn.tracer(0)  # turn off auto-updates (we manually refresh)

# ----- Snake head -----
head = turtle.Turtle()
head.speed(0)
head.shape("square")
head.color("lime")
head.penup()
head.goto(0, 0)
head.direction = "stop"

# ----- Food -----
food = turtle.Turtle()
food.speed(0)
food.shape("circle")
food.color("red")
food.penup()
food.goto(0, 100)

# ----- Snake body segments -----
segments = []

# ----- Score -----
score = 0

# ----- Movement helpers -----
def go_up():
    if head.direction != "down":
        head.direction = "up"

def go_down():
    if head.direction != "up":
        head.direction = "down"

def go_left():
    if head.direction != "right":
        head.direction = "left"

def go_right():
    if head.direction != "left":
        head.direction = "right"

def move():
    x = head.xcor()
    y = head.ycor()

    if head.direction == "up":
        head.sety(y + 20)
    elif head.direction == "down":
        head.sety(y - 20)
    elif head.direction == "left":
        head.setx(x - 20)
    elif head.direction == "right":
        head.setx(x + 20)

# ----- Keyboard controls -----
wn.listen()
wn.onkeypress(go_up, "Up")
wn.onkeypress(go_down, "Down")
wn.onkeypress(go_left, "Left")
wn.onkeypress(go_right, "Right")

# ----- Main game loop -----
delay = 0.1

while True:
    wn.update()

    # Wall collision
    if head.xcor() > 290 or head.xcor() < -290 or head.ycor() > 290 or head.ycor() < -290:
        time.sleep(1)
        head.goto(0, 0)
        head.direction = "stop"

        for seg in segments:
            seg.goto(1000, 1000)
        segments.clear()
        score = 0
        delay = 0.1

    # Food collision
    if head.distance(food) < 20:
        # move food somewhere random on the grid
        fx = random.randrange(-280, 281, 20)
        fy = random.randrange(-280, 281, 20)
        food.goto(fx, fy)

        # add a new segment
        seg = turtle.Turtle()
        seg.speed(0)
        seg.shape("square")
        seg.color("green")
        seg.penup()
        segments.append(seg)

        score += 1
        # speed up a bit
        delay = max(0.03, delay - 0.003)

    # Move the body: tail follows the segment in front
    for i in range(len(segments) - 1, 0, -1):
        x = segments[i - 1].xcor()
        y = segments[i - 1].ycor()
        segments[i].goto(x, y)

    # First segment follows the head
    if segments:
        segments[0].goto(head.xcor(), head.ycor())

    # Move head
    move()

    # Body collision
    for seg in segments:
        if seg.distance(head) < 20:
            time.sleep(1)
            head.goto(0, 0)
            head.direction = "stop"
            for s in segments:
                s.goto(1000, 1000)
            segments.clear()
            score = 0
            delay = 0.1
            break

    time.sleep(delay)