//Calculate XP and track user progress
//XP earned based on difficulty (change if needed)
function calculateXP(difficulty) {
    switch(difficulty.toLowerCase()) {
        case 'easy':
            return 5;
        case 'medium':
            return 10;
        case 'hard':
            return 15;
        default:
            return 0; 
    }
}

//User titles based on total XP (change if needed)
function determineRank(totalXP) {
    if (totalXP >= 80) return 'Grandmaster';
    if (totalXP >= 65) return 'Master';
    if (totalXP >= 50) return 'Diamond';
    if (totalXP >= 35) return 'Plat';
    if (totalXP >= 30) return 'Gold';
    if (totalXP >= 20) return 'Silver';

    // Starting title
    return 'Bronze'; 
}

//Export to the server.db to be used
module.exports = { calculateXP, determineRank};