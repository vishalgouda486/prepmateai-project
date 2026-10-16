/**
 * PrepAura AI - Natural Speech Synthesis & Markdown Rendering Engine
 * Provides:
 * 1. window.PrepAuraSpeech: Voice detection & scoring, natural English voice selection,
 *    text cleanup (removing markdown syntax, code blocks, UI instructions, emojis),
 *    and natural human-paced speech synthesis.
 * 2. window.PrepAuraMarkdown: Robust client-side Markdown-to-HTML parser rendering
 *    headings, bold, italics, ordered/unordered lists, code blocks, inline code,
 *    blockquotes, dividers, and paragraphs without markdown artifacts.
 */

(function (window) {
    "use strict";

    // ==========================================
    // 1. TEXT CLEANUP FOR SPEECH SYNTHESIS
    // ==========================================
    function cleanTextForSpeech(raw) {
        if (!raw || typeof raw !== "string") return "";

        let text = raw;

        // 1. Remove code blocks completely (TTS should not read code syntax)
        text = text.replace(/```[\s\S]*?```/g, " ");

        // 2. Remove inline code backticks while keeping inner text
        text = text.replace(/`([^`\n]+)`/g, "$1");

        // 3. Remove Markdown headings (# Heading, ## Heading, ### Heading)
        text = text.replace(/^\s*#{1,6}\s+/gm, "");

        // 4. Remove Markdown bold and italic markers (**text**, *text*, __text__, _text_)
        text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
        text = text.replace(/\*([^*]+)\*/g, "$1");
        text = text.replace(/__([^_]+)__/g, "$1");
        text = text.replace(/_([^_]+)_/g, "$1");

        // 5. Remove bullet list markers (-, *, +) at start of lines
        text = text.replace(/^\s*[-*+]\s+/gm, "");

        // 6. Remove numbered list markers (1. , 2. )
        text = text.replace(/^\s*\d+\.\s+/gm, "");

        // 7. Remove blockquotes (> quote)
        text = text.replace(/^\s*>\s+/gm, "");

        // 8. Remove horizontal rules (---, ***, ___)
        text = text.replace(/^\s*[-*_]{3,}\s*$/gm, "");

        // 9. Remove HTML tags
        text = text.replace(/<[^>]*>/g, " ");

        // 10. Remove bracketed stage/UI directions like [Note: ...], (smiling), (pause)
        text = text.replace(/\[(?:Note|Instruction|Hint|UI|Prompt|Role)[^\]]*\]/gi, " ");
        text = text.replace(/\((?:smiling|pause|nodding|laughing|clears throat)\)/gi, " ");

        // 11. Remove emojis that trigger awkward literal pronunciation in TTS
        text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, " ");

        // 12. Strip leftover markdown artifact symbols
        text = text.replace(/[*#_`~]/g, "");

        // 13. Normalize whitespace
        text = text.replace(/\s+/g, " ").trim();

        return text;
    }

    // ==========================================
    // 2. NATURAL VOICE ENGINE
    // ==========================================
    const VoiceEngine = (function () {
        let cachedVoices = [];
        let bestVoice = null;

        function scoreVoice(voice) {
            if (!voice) return -100;
            const name = (voice.name || "").toLowerCase();
            const lang = (voice.lang || "").toLowerCase();

            // Only score English voices
            if (!lang.startsWith("en")) return -100;

            let score = 10;

            // Tier 1: Premier Natural / Neural Online Voices (Edge & Chrome Online Natural)
            if (name.includes("natural") || name.includes("neural") || name.includes("online")) {
                score += 100;
            }

            // Top rated human-sounding names
            if (name.includes("aria") || name.includes("jenny") || name.includes("guy") || name.includes("christopher")) {
                score += 50;
            } else if (name.includes("sonia") || name.includes("natasha") || name.includes("william") || name.includes("libby") || name.includes("ryan")) {
                score += 40;
            }

            // Tier 2: Apple Enhanced / Premium Neural Voices (Safari / macOS / iOS)
            if (name.includes("enhanced") || name.includes("premium")) {
                score += 85;
            }
            if (name.includes("samantha") || name.includes("ava") || name.includes("serena") || name.includes("zoe") || name.includes("daniel")) {
                score += 35;
            }

            // Tier 3: Google Chrome High-Quality Cloud Voices
            if (name.includes("google")) {
                score += 65;
                if (name.includes("us english") || name.includes("uk english female")) {
                    score += 20;
                }
            }

            // Standard modern system voices
            if (name.includes("zira") || name.includes("david") || name.includes("karen") || name.includes("victoria")) {
                score += 20;
            }

            // Prefer en-US and en-GB
            if (lang === "en-us") score += 15;
            else if (lang === "en-gb") score += 12;
            else if (lang.startsWith("en")) score += 8;

            // Heavily penalize robotic desktop / espeak synthesizers
            if (name.includes("desktop") || name.includes("espeak") || name.includes("hazel")) {
                score -= 30;
            }

            return score;
        }

        function refreshVoices() {
            if (typeof window === "undefined" || !window.speechSynthesis) return [];
            try {
                const list = window.speechSynthesis.getVoices() || [];
                if (list.length > 0) {
                    cachedVoices = list;
                    const scored = cachedVoices
                        .map(v => ({ voice: v, score: scoreVoice(v) }))
                        .filter(item => item.score > 0)
                        .sort((a, b) => b.score - a.score);

                    if (scored.length > 0) {
                        bestVoice = scored[0].voice;
                    } else {
                        bestVoice = cachedVoices.find(v => (v.lang || "").toLowerCase().startsWith("en")) || cachedVoices[0] || null;
                    }
                }
            } catch (e) {
                console.warn("[PrepAuraVoice] Error getting voices:", e);
            }
            return cachedVoices;
        }

        if (typeof window !== "undefined" && window.speechSynthesis) {
            refreshVoices();
            if ("onvoiceschanged" in window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = refreshVoices;
            }
            window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
        }

        function getBestVoice() {
            if (!bestVoice || cachedVoices.length === 0) {
                refreshVoices();
            }
            return bestVoice;
        }

        return {
            getVoices: () => (cachedVoices.length > 0 ? cachedVoices : refreshVoices()),
            getBestVoice,
            refreshVoices
        };
    })();

    // ==========================================
    // 3. NATURAL SPEECH SYNTHESIS CONTROLLER
    // ==========================================
    let activeResumeInterval = null;

    function stopSpeech() {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        if (activeResumeInterval) {
            clearInterval(activeResumeInterval);
            activeResumeInterval = null;
        }
    }

    function speakNatural(rawText, options = {}) {
        if (typeof window === "undefined" || !window.speechSynthesis) return;

        stopSpeech();

        const cleanText = cleanTextForSpeech(rawText);
        if (!cleanText) return;

        const voice = VoiceEngine.getBestVoice();
        const utterance = new SpeechSynthesisUtterance(cleanText);

        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang || "en-US";
        } else {
            utterance.lang = "en-US";
        }

        // Natural, warm, human cadence:
        // Rate: 0.98 gives clear conversational pacing without rushing
        // Pitch: 1.0 keeps voice in natural, pleasant range
        utterance.rate = options.rate !== undefined ? options.rate : 0.98;
        utterance.pitch = options.pitch !== undefined ? options.pitch : 1.0;
        utterance.volume = options.volume !== undefined ? options.volume : 1.0;

        const cleanup = () => {
            if (activeResumeInterval) {
                clearInterval(activeResumeInterval);
                activeResumeInterval = null;
            }
        };

        // Fix Chrome background stall bug on long utterances (>15s)
        utterance.onstart = (e) => {
            cleanup();
            activeResumeInterval = setInterval(() => {
                if (!window.speechSynthesis.speaking) {
                    cleanup();
                } else {
                    window.speechSynthesis.pause();
                    window.speechSynthesis.resume();
                }
            }, 10000);

            if (typeof options.onStart === "function") options.onStart(e);
        };

        utterance.onend = (e) => {
            cleanup();
            if (typeof options.onEnd === "function") options.onEnd(e);
        };

        utterance.onerror = (e) => {
            cleanup();
            if (typeof options.onError === "function") options.onError(e);
        };

        window.speechSynthesis.speak(utterance);
    }

    // ==========================================
    // 4. MARKDOWN TO HTML RENDERER
    // ==========================================
    function escapeHTML(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderMarkdownToHTML(md) {
        if (!md || typeof md !== "string") return "";

        let text = md.trim();

        // 1. Code blocks: ```lang\ncode\n```
        const codeBlocks = [];
        text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const id = `@@@PREPAURACODEBLOCK${codeBlocks.length}@@@`;
            codeBlocks.push(`<pre class="ai-code-block"><code class="language-${escapeHTML(lang || 'plaintext')}">${escapeHTML(code.trim())}</code></pre>`);
            return `\n\n${id}\n\n`;
        });

        // 2. Inline code: `code`
        const inlineCodes = [];
        text = text.replace(/`([^`\n]+)`/g, (match, code) => {
            const id = `@@@PREPAURAINLINECODE${inlineCodes.length}@@@`;
            inlineCodes.push(`<code class="ai-inline-code">${escapeHTML(code)}</code>`);
            return id;
        });

        // 3. Headings:
        text = text.replace(/^\s*###\s+(.*$)/gm, '\n\n<div class="ai-mini-heading">$1</div>\n\n');
        text = text.replace(/^\s*##\s+(.*$)/gm, '\n\n<div class="ai-sub-heading">$1</div>\n\n');
        text = text.replace(/^\s*#\s+(.*$)/gm, '\n\n<div class="ai-main-heading">$1</div>\n\n');

        // 4. Horizontal rules
        text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '\n\n<hr class="ai-divider">\n\n');

        // 5. Blockquotes: > quote
        text = text.replace(/^\s*>\s+(.*$)/gm, '\n\n<blockquote class="ai-quote">$1</blockquote>\n\n');

        // 6. Bold & Italics
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="inline-bold">$1</strong>');
        text = text.replace(/__(.*?)__/g, '<strong class="inline-bold">$1</strong>');
        text = text.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
        text = text.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, '$1<em>$2</em>$3');

        // 7. Group list items
        const lines = text.split("\n");
        const resultLines = [];
        let inUl = false;
        let inOl = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
            const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);

            if (ulMatch) {
                if (inOl) {
                    resultLines.push("</ol>\n");
                    inOl = false;
                }
                if (!inUl) {
                    resultLines.push('\n<ul class="ai-list">');
                    inUl = true;
                }
                resultLines.push(`  <li class="ai-bullet">${ulMatch[1]}</li>`);
            } else if (olMatch) {
                if (inUl) {
                    resultLines.push("</ul>\n");
                    inUl = false;
                }
                if (!inOl) {
                    resultLines.push('\n<ol class="ai-ordered-list">');
                    inOl = true;
                }
                resultLines.push(`  <li class="ai-ordered-item">${olMatch[2]}</li>`);
            } else {
                if (inUl) {
                    resultLines.push("</ul>\n");
                    inUl = false;
                }
                if (inOl) {
                    resultLines.push("</ol>\n");
                    inOl = false;
                }
                resultLines.push(line);
            }
        }
        if (inUl) resultLines.push("</ul>\n");
        if (inOl) resultLines.push("</ol>\n");

        text = resultLines.join("\n");

        // 8. Paragraphs: split by multiple empty lines
        const rawBlocks = text.split(/\n{2,}/);
        const htmlBlocks = rawBlocks.map(block => {
            const trimmed = block.trim();
            if (!trimmed) return "";
            if (/^(<(?:div|ul|ol|pre|blockquote|hr|table|h[1-6]|p)|@@@PREPAURA)/i.test(trimmed)) {
                return trimmed;
            }
            return `<p class="ai-paragraph">${trimmed.replace(/\n/g, "<br>")}</p>`;
        });

        text = htmlBlocks.filter(Boolean).join("\n");

        // 9. Restore code blocks and inline codes
        text = text.replace(/@@@PREPAURACODEBLOCK(\d+)@@@/g, (m, idx) => codeBlocks[idx] || "");
        text = text.replace(/@@@PREPAURAINLINECODE(\d+)@@@/g, (m, idx) => inlineCodes[idx] || "");

        // 10. Clean any leftover stray markdown artifacts
        text = text.replace(/\*\*/g, "");
        text = text.replace(/###/g, "");
        text = text.replace(/##/g, "");

        return text;
    }

    // Export to global window object
    window.PrepAuraSpeech = {
        cleanTextForSpeech,
        VoiceEngine,
        speak: speakNatural,
        stop: stopSpeech
    };

    window.PrepAuraMarkdown = {
        render: renderMarkdownToHTML,
        cleanText: cleanTextForSpeech,
        escapeHTML
    };

})(typeof window !== "undefined" ? window : globalThis);
