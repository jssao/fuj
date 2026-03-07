const app = document.getElementById("app");
const gestureButton = document.getElementById("gestureButton");
const hand = document.getElementById("hand");
const hint = document.getElementById("hint");

gestureButton.addEventListener("click", () => {
  const armed = app.classList.toggle("armed");

  hand.classList.toggle("flipped", armed);
  hand.classList.toggle("fist", !armed);
  gestureButton.setAttribute("aria-pressed", String(armed));
  hint.textContent = armed ? "click again to reset" : "click the fist";
});
