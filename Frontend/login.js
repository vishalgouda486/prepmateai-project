document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const loginButton = document.getElementById("login-button");
    const errorMessage = document.getElementById("error-message");

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault(); // Stop the form from reloading the page
        
        const email = emailInput.value;
        const password = passwordInput.value;

        loginButton.disabled = true;
        loginButton.innerText = "Logging in...";
        errorMessage.style.display = "none";

        try {
            // Call the /api/login route we created in app.py
            const response = await fetch("https://prepmateai-project-production.up.railway.app/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: email,
                    password: password,
                }),
                credentials: 'include',
            });

            const data = await response.json();
            if (response.ok) {
                if (response.ok) {

                    // Show AI Futuristic Success Popup
                    const box = document.getElementById("success-box");
                    box.classList.remove("hidden");
                    box.innerHTML = `
                        <div class="success-icon">✔</div>
                        <p>Welcome, ${data.username}</p>
                    `;

                    // 🔥 The important fix
                    setTimeout(() => {
                        box.classList.add("show");
                    }, 30);

                    // Redirect after animation
                    setTimeout(() => {
                        window.location.href = "home.html";
                    }, 1800);
    
                }

            } else {
                // Show the error from the server
                errorMessage.innerText = `Error: ${data.error}`;
                errorMessage.style.display = "block";
                loginButton.disabled = false;
                loginButton.innerText = "Login";
            }
        } catch (error) {
            // Show a generic network error
            errorMessage.innerText = "Error: Could not connect to the server.";
            errorMessage.style.display = "block";
            loginButton.disabled = false;
            loginButton.innerText = "Login";
            console.error("Login fetch error:", error);
        }
    });
});