document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const errorMessage = document.getElementById("error-message");

  if (!form) {
    console.error("Login form not found!");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
      errorMessage.textContent = "Please enter both email and password.";
      errorMessage.style.display = "block";
      return;
    }

    try {
      const response = await fetch("http://127.0.0.1:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log("Login successful ✅");
        localStorage.setItem("userEmail", email);
        window.location.href = "home.html";
      } else {
        errorMessage.textContent = result.message || "Invalid credentials.";
        errorMessage.style.display = "block";
      }
    } catch (err) {
      console.error("Login error:", err);
      errorMessage.textContent = "Server not reachable. Please try again later.";
      errorMessage.style.display = "block";
    }
  });
});
