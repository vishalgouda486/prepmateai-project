// chatbot.js — orb behaviour (navigates to chat page)
// clicking orb goes to chat.html; add tracking or analytics here if needed.

document.addEventListener("DOMContentLoaded", () => {
  const orb = document.getElementById("chat-orb");
  if (!orb) return;

  // quick click animation
  orb.addEventListener("pointerdown", () => orb.classList.add("active"));
  orb.addEventListener("pointerup", () => orb.classList.remove("active"));
  orb.addEventListener("pointerleave", () => orb.classList.remove("active"));

  orb.addEventListener("click", (e) => {
    e.preventDefault();
    // navigate to the chat page
    // you can change path if stored in subfolder
    window.location.href = "chat.html";
  });

  // optional: hide orb on small screens if you want
  // if (window.innerWidth < 350) orb.style.display = "none";
});
