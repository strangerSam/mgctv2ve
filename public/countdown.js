// Set the date we're counting down to (example: 1 month from now)
const countDownDate = new Date().getTime() + (30 * 24 * 60 * 60 * 1000);

// Update the countdown every 1 second
const countdown = setInterval(function() {
    const now = new Date().getTime();
    const distance = countDownDate - now;

    // Calculate days, hours, minutes and seconds
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    // Display the result
    document.getElementById("days").textContent = days.toString().padStart(2, '0');
    document.getElementById("hours").textContent = hours.toString().padStart(2, '0');
    document.getElementById("minutes").textContent = minutes.toString().padStart(2, '0');
    document.getElementById("seconds").textContent = seconds.toString().padStart(2, '0');

    // If the countdown is finished
    if (distance < 0) {
        clearInterval(countdown);
        document.querySelector(".countdown-container").innerHTML = "EXPIRED";
    }
}, 1000);