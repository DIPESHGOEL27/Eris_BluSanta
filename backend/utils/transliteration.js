const fetch = require("node-fetch");

const preprocessAndTransliterate = async (fullName) => {
  if (!fullName || typeof fullName !== "string") return "";

  console.log(`[TRANSLITERATION] 🔤 Input name: "${fullName}"`);

  const cleanedName = fullName
    .replace(/[\.\u200B]/g, "") // remove dots and zero-width characters
    .replace(/\s+/g, " ") // normalize whitespace
    .trim();

  const words = cleanedName.split(" ");
  const outputWords = [];

  for (const word of words) {
    // Initials like "AR", "DR", "RJ" – skip transliteration, expand spacing
    if (/^[A-Z]{2,4}$/.test(word)) {
      outputWords.push(word.split("").join(" "));
    }
    // Single letters like "D" – skip transliteration
    else if (/^[A-Z]$/.test(word)) {
      outputWords.push(word);
    }
    // Actual names or mixed-case – transliterate
    else {
      const transliterated = await transliterateText(word);
      outputWords.push(transliterated || word);
    }
  }

  const result = outputWords.join(" ");
  console.log(`[TRANSLITERATION] ✅ Output: "${fullName}" → "${result}"`);
  return result;
};

async function transliterateText(
  sourceText,
  inputLanguageCode = "hi-t-i0-und",
  maxResult = 1
) {
  const alphanumericWithLatin = sourceText.match(
    /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF. ]+/
  );

  if (!alphanumericWithLatin) {
    console.warn("No valid text found for transliteration.");
    return null;
  }

  const query = encodeURIComponent(alphanumericWithLatin[0]);
  const url = `https://inputtools.google.com/request?text=${query}&itc=${inputLanguageCode}&num=${maxResult}&cp=0&cs=1&ie=utf-8&oe=utf-8&app=gonuts`;

  console.log(`[TRANSLITERATION] 🌐 Calling Google API for: "${sourceText}"`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data[0] === "SUCCESS" && data[1]?.[0]?.[1]?.length) {
      const transliterated = data[1][0][1][0]; // First transliterated suggestion
      console.log(`[TRANSLITERATION] ✅ "${sourceText}" → "${transliterated}"`);
      return transliterated;
    }

    console.warn(`[TRANSLITERATION] ⚠️ No transliteration found for: "${sourceText}"`);
    return null;
  } catch (error) {
    console.error(`[TRANSLITERATION] ❌ Fetch failed for "${sourceText}":`, error.message);
    throw new Error("Error in transliteration");
  }
}
module.exports = {
  preprocessAndTransliterate,
};
