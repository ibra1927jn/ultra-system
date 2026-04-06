// Extrae arrays numericos de registros bio para correlaciones
function extractBioArrays(data) {
  return {
    sleep: data.map(d => parseFloat(d.sleep_hours)),
    energy: data.map(d => parseInt(d.energy_level)),
    mood: data.map(d => parseInt(d.mood)),
    exercise: data.map(d => parseInt(d.exercise_minutes)),
  };
}

module.exports = { extractBioArrays };
