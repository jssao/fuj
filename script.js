const handButton = document.getElementById("handButton");
const hand = document.getElementById("hand");
const message = document.getElementById("message");

handButton.addEventListener("click", () => {
  const flipped = hand.classList.toggle("flipped");
  hand.classList.toggle("fist", !flipped);
  message.classList.toggle("visible", flipped);
});
