const app = document.getElementById("app");
const chestButton = document.getElementById("chestButton");
const hint = document.getElementById("hint");

chestButton.addEventListener("click", () => {
  const opened = app.classList.toggle("opened");

  chestButton.setAttribute("aria-pressed", String(opened));
  hint.textContent = opened ? "click again to close the chest" : "click the chest";
});
