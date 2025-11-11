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
            const response = await fetch("https://prepmate-backend-x77z.onrender.com/api/login", {
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
                // Success! Redirect to the home page
                alert("Login successful! Welcome, " + data.username);
                window.location.href = "home.html";
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