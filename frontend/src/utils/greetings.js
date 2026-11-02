/**
 * Dynamic creative greetings based on time of day with 4-5 options each.
 */
export function getCreativeGreeting(userName = "") {
  const name = userName ? userName.trim().split(" ")[0] : "Learner";
  const fullName = userName ? userName.trim() : "Learner";
  const hour = new Date().getHours();

  let options = [];

  if (hour >= 5 && hour < 12) {
    // Early Morning / Morning
    options = [
      `Wassup ${name}, The early Birdie 🌅`,
      `Morning Thoughts & Clean Focus, ${fullName} ☕`,
      `Rise and conquer, ${name} ☀️`,
      `Fresh daylight, clean slate — let's build, ${name} 🌤️`,
      `Early morning momentum starts right here, ${name} 🚀`,
    ];
  } else if (hour >= 12 && hour < 17) {
    // Afternoon
    options = [
      `Afternoon Flow & Deep Work, ${name} ⚡`,
      `Midday momentum, ${name} — keep rolling 💪`,
      `Locked in for the afternoon sprint, ${name} 🎯`,
      `Fueling afternoon breakthroughs, ${name} 🧠`,
      `Peak daylight focus, ${name} ✨`,
    ];
  } else if (hour >= 17 && hour < 21) {
    // Evening
    options = [
      `Evening Thoughts, ${fullName} 🌇`,
      `Unwinding with purposeful learning, ${name} 🌆`,
      `The golden hour of mastery, ${name} 🌙`,
      `Evening clarity hit right on time, ${name} 💡`,
      `Quiet evening, sharp mind, ${name} ✨`,
    ];
  } else {
    // Night
    options = [
      `Night time Grinding, ${fullName} 🦉`,
      `Midnight oil burning bright, ${name} 🌌`,
      `Quiet hours, loudest progress, ${name} 🌙`,
      `Late night breakthroughs in progress, ${name} ⚡`,
      `The night owl's sanctuary, ${name} ✨`,
    ];
  }

  // Use current date day-of-year + hour to deterministically select a greeting,
  // or random selection per session so it feels alive and never repetitive
  const index = Math.floor(Math.random() * options.length);
  return options[index];
}
