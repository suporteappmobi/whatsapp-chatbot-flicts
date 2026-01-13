
// whatsapp-chatbot-flicts - FULL chatbot

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ===================== CONFIG VARIABLES ======================
const ATTENDANT_NAME = process.env.ATTENDANT_NAME || "Fábio Barbará";
const ATTENDANT_PHOTO = process.env.ATTENDANT_PHOTO || "https://www.appmobi.com.br/wp-content/uploads/2025/11/fabio.jpg";
const TARGET_NUMBER = process.env.TARGET_NUMBER || "5511958610544";

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "verifytoken";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "your_whatsapp_access_token";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "your_phone_number_id";

// ===================== SESSION MEMORY ==========================
const sessions = {}; 

// ===================== HELPERS ================================

function sendText(to, body) {
    return axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body }
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

function sendList(to, header, body, rows) {
    return axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "list",
                header: { type: "text", text: header },
                body: { text: body },
                action: {
                    button: "Selecionar",
                    sections: [
                        {
                            title: "Escolha",
                            rows
                        }
                    ]
                }
            }
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

function sendTyping(to) {
    return axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "typing_on"
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

// ===================== CHATBOT LOGIC ==========================

async function processMessage(from, msg) {
    if (!sessions[from]) {
        sessions[from] = { step: 1, data: { interests: [] } };
        await sendText(from, "Olá! Qual seu nome?");
        return;
    }

    const session = sessions[from];
    const userInput = msg?.text?.body || msg?.interactive?.list_reply?.title || "";
    const listId = msg?.interactive?.list_reply?.id || null;

    switch (session.step) {
        case 1:
            session.data.name = userInput;
            session.step = 2;
            await sendText(from, "É um contato Particular ou Empresa/Organização?\n\n*1.* Particular\n*2.* Empresa / Organização");
            break;

        case 2:
            if (userInput.startsWith("1")) {
                session.data.type = "Particular";
                session.step = 30;
                await sendText(from, "Ok! Qual a atividade que você realiza?\nOu digite *Pular*.");
            } else {
                session.data.type = "Empresa / Organização";
                session.step = 20;
                await sendText(from, "Digite o nome da empresa.\nOu digite *Pular*.");
            }
            break;

        case 20:
            if (userInput.toLowerCase() !== "pular") session.data.companyName = userInput;
            session.step = 21;
            await sendText(from, "Qual o ramo de atividade da empresa?");
            break;

        case 21:
            session.data.companyArea = userInput;
            session.step = 4;
            await showInterestList(from);
            break;

        case 30:
            if (userInput.toLowerCase() !== "pular") session.data.activity = userInput;
            session.step = 4;
            await showInterestList(from);
            break;

        case 4:
            if (listId === "end") {
                session.step = 5;
                await sendText(from,
                    "Como ficou sabendo do Flicts?\n\n" +
                    "*1.* Indicação\n*2.* Google\n*3.* Anúncio em redes sociais\n*4.* Redes Sociais\n*5.* Acompanhei uma gravação"
                );
                break;
            }

            const interestMap = {
                i1: "Podcast / Videocast",
                i2: "Estúdio Chroma-key",
                i3: "Gravação de Cursos",
                i4: "Produção de Lives",
                i5: "Produção Audiovisual"
            };

            if (interestMap[listId]) {
                session.data.interests.push(interestMap[listId]);
                await sendText(from, "Adicionado! Escolha outra opção ou clique *Somente isso*.");
            }
            break;

        case 5:
            const refMap = {
                "1": "Indicação",
                "2": "Google",
                "3": "Anúncio em redes sociais",
                "4": "Redes Sociais",
                "5": "Acompanhei uma gravação"
            };

            session.data.reference = refMap[userInput] || userInput;

            await sendText(from, "Estamos direcionando para o nosso atendimento humano. O Fábio irá te responder logo…");

            const summary =
                `*Nome:* ${session.data.name}\n` +
                `*Tipo:* ${session.data.type}\n` +
                (session.data.companyName ? `*Empresa:* ${session.data.companyName}\n` : "") +
                (session.data.companyArea ? `*Ramo:* ${session.data.companyArea}\n` : "") +
                (session.data.activity ? `*Atividade:* ${session.data.activity}\n` : "") +
                `*Interesses:* ${session.data.interests.join(", ")}\n` +
                `*Origem:* ${session.data.reference}`;

            await sendText(TARGET_NUMBER, summary);
            session.step = 999;
            break;
    }
}

async function showInterestList(to) {
    await sendTyping(to);
    setTimeout(() => {
        sendList(
            to,
            "Interesses",
            "Você está interessado em saber mais sobre:",
            [
                { id: "i1", title: "Podcast / Videocast" },
                { id: "i2", title: "Estúdio Chroma-key" },
                { id: "i3", title: "Gravação de Cursos" },
                { id: "i4", title: "Produção de Lives" },
                { id: "i5", title: "Produção Audiovisual" },
                { id: "end", title: "Somente isso" }
            ]
        );
    }, 1200);
}

// ===================== WEBHOOK ==========================

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    return res.status(403).send("Token inválido.");
});

app.post("/webhook", async (req, res) => {
    try {
        const entry = req.body.entry?.[0]?.changes?.[0]?.value;
        const message = entry?.messages?.[0];
        if (message) {
            const from = message.from;
            await processMessage(from, message);
        }
        res.sendStatus(200);
    } catch (e) {
        console.error("Webhook error:", e);
        res.sendStatus(500);
    }
});

app.listen(3000, () => console.log("Chatbot running on port 3000"));
