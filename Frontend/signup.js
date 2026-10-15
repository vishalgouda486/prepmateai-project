document.addEventListener("DOMContentLoaded", () => {
    const signupForm = document.getElementById("signup-form");
    const usernameInput = document.getElementById("username");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const signupButton = document.getElementById("signup-button");
    const message = document.getElementById("message");

    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault(); // Stop the form from reloading the page
        
        const username = usernameInput.value;
        const email = emailInput.value;
        const password = passwordInput.value;

        signupButton.disabled = true;
        signupButton.innerText = "Creating...";
        message.style.display = "none";
        message.style.color = "#F87171"; // Default to error color

        try {
            // Call the /api/signup route we created in app.py
            const response = await fetch("https://prepmateai-project-production.up.railway.app/api/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password,
                }),
                credentials: 'include',
            });

            const data = await response.json();

            if (response.ok) {
                // Success! Show a success message and tell them to log in.
                message.innerText = "Success! Your account has been created. You can now login.";
                message.style.color = "#34D399"; // Green color for success
                message.style.display = "block";
                signupForm.reset(); // Clear the form
                signupButton.innerText = "Create Account";
                signupButton.disabled = false; // Re-enable in case they want to make another
            } else {
                // Show the error from the server
                message.innerText = `Error: ${data.error}`;
                message.style.display = "block";
                signupButton.disabled = false;
                signupButton.innerText = "Create Account";
            }
        } catch (error) {
            // Show a generic network error
            message.innerText = "Error: Could not connect to the server.";
            message.style.display = "block";
            signupButton.disabled = false;
            signupButton.innerText = "Create Account";
            console.error("Signup fetch error:", error);
        }
    });
});