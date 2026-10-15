// This script will run on every page to check login status
document.addEventListener("DOMContentLoaded", () => {
    
    // Find the main navigation bar's link list
    const navLinksList = document.getElementById("nav-links-list");
    if (!navLinksList) {
        // If there's no navbar (like on the splash page), do nothing
        return;
    }

    // Function to handle logout
    const handleLogout = async () => {
        try {
            // Use the full URL
            const response = await fetch("https://prepmateai-project-production.up.railway.app/api/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: 'include',
            });
             if (response.ok) {

                // 🔥 NEW POPUP LOGOUT ANIMATION
                const popup = document.getElementById("logout-success");

                if (popup) {
                    popup.classList.remove("hidden");
                    setTimeout(() => popup.classList.add("show"), 50);

                    // Redirect after animation
                    setTimeout(() => {
                        window.location.href = "login.html";
                    }, 1500);

                } else {
                    // fallback if popup missing
                    window.location.href = "login.html";
                }
            }

        } catch (error) {
            console.error("Logout failed:", error);

            // OPTIONAL: You can add an error-popup here too
            alert("Logout failed. Could not connect to server.");
        }
    };
    
    // Function to check the session and update the navbar
    const checkUserSession = async () => {
        try {
            // Use the full URL
            const response = await fetch("https://prepmateai-project-production.up.railway.app/api/check_session", {
                method: "GET",
                credentials: 'include',
            });

            const data = await response.json();

            if (response.ok && data.is_logged_in) {
                // USER IS LOGGED IN
                // We add 'home', 'practice', 'mock test', and the user info
                navLinksList.innerHTML = `
                    <li><a href="home.html">Home</a></li>
                    <li><a href="practice.html">Practice Hub</a></li>
                    <li><a href="mock_test.html">Mock Test</a></li>
                    <li class="nav-user-info">Welcome, ${data.username}!</li>
                    <li><a href="#" id="logout-button" class="nav-logout">Logout</a></li>
                `;
                
                // Add the event listener to the new logout button
                document.getElementById("logout-button").addEventListener("click", handleLogout);

            } else {
                // USER IS LOGGED OUT
                // We add 'home', 'practice', 'mock test', and the login/signup buttons
                navLinksList.innerHTML = `
                    <li><a href="home.html">Home</a></li>
                    <li><a href="practice.html">Practice Hub</a></li>
                    <li><a href="mock_test.html">Mock Test</a></li>
                    <li><a href="login.html" class="nav-button-login">Login</a></li>
                    <li><a href="signup.html" class="nav-button-signup">Sign Up</a></li>
                `;
            }
        } catch (error) {
            // If server is down, just show default links
            console.error("Session check failed:", error);
            navLinksList.innerHTML = `
                <li><a href="home.html">Home</a></li>
                <li><a href="login.html" class="nav-button-login">Login</a></li>
            `;
        }
    };

    checkUserSession();
});