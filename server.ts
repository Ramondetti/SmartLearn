"use strict"

import http from "http"
import https from "https"
import fs from "fs"
import express, { CookieOptions, NextFunction } from "express"
import dotenv from "dotenv"
import {MongoClient, ObjectId} from "mongodb"
import queryStringParser from "./queryStringParser"
import cors from "cors"
import multer from 'multer'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import cookieParser from "cookie-parser"
import Tesseract, { createWorker } from 'tesseract.js';

const app = express()
dotenv.config({path:".env"})
const connectionString = process.env.connectionStringLocal
const dbName = process.env.dbName
const genAI = new GoogleGenAI({apiKey: process.env.GenAI_KEY!});
const HTTPS_PORT = process.env.HTTPS_PORT

const server = http.createServer(app)

//CREZIONE ED AVVIO DI UN SERVER HTTPS
const privateKey = fs.readFileSync("keys/privateKey.pem","utf8")
const certificate = fs.readFileSync("keys/certificate.crt","utf8")
const credentials = { "key":privateKey, "cert":certificate}
const jwtKey = fs.readFileSync("keys/jwtKey","utf-8")

let httpsServer = https.createServer(credentials, app);
httpsServer.listen(HTTPS_PORT, function(){
 console.log("Server in ascolto sulle porta:" + " HTTPS:" + HTTPS_PORT)
});

let paginaErrore:string = ""

server.listen(process.env.port,function(){
    console.log("Server in ascolto sulla porta: " + process.env.port)
    fs.readFile("./static/error.html", function(err,content){
        if(err){
            paginaErrore = "<h1>Risorsa non trovata</h1>"
        }
        else{
            paginaErrore = content.toString()
        }
    })
})

// Middleware
app.use("/",function(req,res,next){
    console.log(req.method + ": " + req.originalUrl)
    next()
})

app.use("/",express.static("./static"))
app.use("/",express.json({"limit":"5mb"}))
app.use("/",queryStringParser)

const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non supportato. Solo PDF, JPG, PNG.'));
    }
  }
});

app.use("/",function(req,res,next){
    if(req["query"] && Object.keys(req["query"]).length > 0)
        console.log("      " + JSON.stringify(req["query"]))
    if(req.body && Object.keys(req.body).length > 0){
        console.log("     Parametri body: " + JSON.stringify(req.body))
    }
    next()
})

const corsOptions = {
 origin: function(origin:any, callback:any) {
 return callback(null, true);
 },
 credentials: true
};
app.use("/", cors(corsOptions));

//7 cookie parser
app.use(cookieParser())

//D2. Gestione login e token
//il servizio di login deve essere eseguito prima del controllo del token
const cookiesOption:CookieOptions = {
    "path":"/", //vale per tutte le sotto-route
    "httpOnly":true, // il cookie non è visibile da javascript
    "secure":true, //il cookie è trasmesso solo su canali HTTPS
    "maxAge": parseInt(process.env.durata_token!) * 1000, //durata relativa a partire da adesso espressa in ms
    "sameSite":"lax" //i cookie devono essere trasmessi oltre domain
}

app.post("/api/loginWithGoogle", async function(req, res, next) {
    const googleToken = req.body.googleToken;

    // 1. Chiediamo a Google i dati dell'utente usando il token
    const googleResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { "Authorization": `Bearer ${googleToken}` }
    });

    // Se il token non è valido, Google risponderà con un errore
    if (!googleResponse.ok) {
        return res.status(401).send("Token Google non valido o scaduto");
    }

    const payload = await googleResponse.json(); // Qui hai i dati: { email, name, ... }
    
    const client = new MongoClient(connectionString!);
    try {
        await client.connect();
        const collection = client.db(dbName).collection("utenti");
        
        // 2. Usiamo payload.email (che ora è valorizzato correttamente)
        const existingUser = await collection.findOne({ username: payload.email });

        if (existingUser) {
            return res.status(400).send("Utente già registrato");
        }

        const newUser:any = {
            username: payload.email,
            nome: payload.name || "",
            password: ""
        };
        
        const mongoResponse = await collection.insertOne(newUser);
        newUser._id = mongoResponse.insertedId;
        
        let TOKEN = createToken(newUser);
        res.cookie("TOKEN", TOKEN, cookiesOption);
        res.send({ "ris": "ok","_id":newUser._id, "username": newUser.username, "nome":newUser.nome });

    } catch (err) {
        res.status(500).send("Errore esecuzione: " + err);
    } finally {
        await client.close();
    }
});

function createToken(data:any){
    //getTime restituisce il TIME UNIX in millisecondi
    const now = Math.floor((new Date()).getTime()/1000)
    const payload = {
        "_id": data._id,
        "username": data.username,
        "nome":data.nome,
        "iat": data.iat || now,
        "exp": now + parseInt(process.env.durata_token!)
    }
    const token = jwt.sign(payload,jwtKey)
    console.log("Creato nuovo token: ", token)
    return token
}

app.post("/api/registrazione",async function(req,res,next){
    const nome = req.body.nome
    const email = req.body.email
    const password = req.body.password
    const hashedPassword = await bcrypt.hash(password, 10);

    const client = new MongoClient(connectionString!)
    await client.connect().catch(function(err){
        res.status(503).send("Errore di connessione al dbms")
        return
    })
    const collection = client.db(dbName).collection("utenti")

    const existingUser = await collection.findOne({ email })

    if (existingUser) {
        client.close()
        return res.status(400).send("Email già registrata")
    }

    const cmd = collection.insertOne({
        nome,
        email,
        "password": hashedPassword
    })

    cmd.catch(function(err){
        res.status(500).send("Errore esecuzione query: " + err)
    })

    cmd.then(function(data){
        const token = createToken(data)
        res.cookie("TOKEN",token,cookiesOption)
        console.log("Cookie: ", res.getHeader("set-cookie"))
        res.send({"_id":data.insertedId, "nome":nome})
    })

    cmd.finally(function(){
        client.close()
    })

})

app.post("/api/upload", upload.single("file"), async function(req, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (step: number, pct: number, msg: string) => {
        res.write(`data: ${JSON.stringify({ step, pct, msg })}\n\n`);
    };

    let responseEnded = false;
    
    const safeEnd = () => {
        if (!responseEnded) {
            res.end();
            responseEnded = true;
        }
    };
    
    const safeWrite = (data: string) => {
        if (!responseEnded) {
            res.write(data);
        }
    };

    try {
        const filePath: any = req.file?.path;
        const mimeType = req.file?.mimetype;

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(mimeType!)) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await fs.promises.unlink(filePath);
            
            safeWrite(`data: ${JSON.stringify({ error: "Tipo file non supportato. Usa PDF, JPG o PNG" })}\n\n`);
            return safeEnd();
        }

        sendEvent(1, 10, "Lettura del file...");

        let extractedTextFromPdf: string;
        
        try {
            if (mimeType!.startsWith('image/')) {
                sendEvent(1, 15, "🔍 Riconoscimento testo con OCR...");
            } else {
                sendEvent(1, 15, "Estrazione testo in corso...");
            }
            
            extractedTextFromPdf = await extractText(filePath, mimeType!);
            
            if (!extractedTextFromPdf || extractedTextFromPdf.length < 50) {
                throw new Error('Testo estratto insufficiente. Assicurati che il documento contenga testo leggibile.');
            }
            
            sendEvent(1, 35, "Testo estratto con successo");
            console.log('✅ Extracted text:', extractedTextFromPdf.length, 'chars');
            
        } catch (extractError: any) {
            console.error('❌ Text extraction failed:', extractError);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                await fs.promises.unlink(filePath);
            } catch {}
            
            safeWrite(`data: ${JSON.stringify({ 
                error: extractError.message || 'Estrazione testo fallita'
            })}\n\n`);
            return safeEnd();
        }

        const MAX_CHARS = 70000;
        const chunks: string[] = [];
        
        for (let i = 0; i < extractedTextFromPdf.length; i += MAX_CHARS) {
            chunks.push(extractedTextFromPdf.substring(i, i + MAX_CHARS));
        }

        console.log('📚 Processing', chunks.length, 'chunks...');
        sendEvent(2, 40, "Generazione flashcard e quiz...");

        // ✅ GENERAZIONE CON RETRY
        const flashcardPromises = chunks.map(async (chunk, index) => {
            const promptFlashcard = `Sei un assistente educativo. Analizza il testo e genera flashcard di studio.
                TESTO:
                """
                ${chunk.substring(0, 60000)}
                """

                ISTRUZIONI CRITICHE:
                1. Genera quante più flashcard possibili che abbiano senso ma massimo 20
                2. Ogni domanda deve essere chiara e specifica
                3. Ogni risposta deve essere accurata e completa
                4. Usa SOLO questo formato JSON (niente testo extra, niente markdown):

                [
                {"front": "Prima domanda?", "back": "Prima risposta dettagliata"},
                {"front": "Seconda domanda?", "back": "Seconda risposta dettagliata"},
                {"front": "Terza domanda?", "back": "Terza risposta dettagliata"},
                {"front": "Quarta domanda?", "back": "Quarta risposta dettagliata"},
                {"front": "Quinta domanda?", "back": "Quinta risposta dettagliata"}
                ]

                IMPORTANTE: Rispondi SOLO con l'array JSON, nient'altro.`;

            try {
                const items = await generateWithRetry(promptFlashcard, 'flashcard');
                console.log(`✅ Flashcard chunk ${index + 1}: ${items.length} valid`);
                return items;
            } catch (error: any) {
                console.error(`❌ Flashcard chunk ${index + 1} failed:`, error.message);
                return [];
            }
        });

        const quizPromises = chunks.map(async (chunk, index) => {
            const promptQuiz = `Sei un assistente educativo. Analizza il testo e genera quiz a risposta multipla.
            TESTO:
            """
            ${chunk.substring(0, 60000)}
            """

            ISTRUZIONI CRITICHE:
            1. Genera quanti più quiz possibili che abbiano senso
            2. Ogni quiz deve avere 4 opzioni
            3. Solo 1 risposta corretta per quiz
            4. Usa SOLO questo formato JSON (niente testo extra, niente markdown):

            [
            {"question": "Prima domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 0},
            {"question": "Seconda domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 1},
            {"question": "Terza domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 2},
            {"question": "Quarta domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 3},
            {"question": "Quinta domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 0}
            ]

            IMPORTANTE:
            - "correct" deve essere 0, 1, 2, o 3 (indice dell'opzione corretta)
            - Rispondi SOLO con l'array JSON, nient'altro.`;

            try {
                const items = await generateWithRetry(promptQuiz, 'quiz');
                console.log(`✅ Quiz chunk ${index + 1}: ${items.length} valid`);
                return items;
            } catch (error: any) {
                console.error(`❌ Quiz chunk ${index + 1} failed:`, error.message);
                return [];
            }
        });

        sendEvent(2, 50, "Elaborazione in corso...");
        
        const [flashcardResults, quizResults] = await Promise.all([
            Promise.all(flashcardPromises),
            Promise.all(quizPromises)
        ]);

        const allFlashcards = flashcardResults.flat();
        const allQuizzes = quizResults.flat();

        // ✅ FALLBACK: Se poche flashcard/quiz, genera minimo garantito
        if (allFlashcards.length < 3) {
            console.warn('⚠️ Too few flashcards, generating fallback...');
            sendEvent(2, 70, "Generazione flashcard aggiuntive...");
            
            const fallbackFlashcards = [
                {
                    front: "Qual è il tema principale del documento?",
                    back: extractedTextFromPdf.substring(0, 200) + "..."
                },
                {
                    front: "Quali sono i punti chiave trattati?",
                    back: "Il documento tratta vari argomenti che richiedono studio approfondito."
                },
                {
                    front: "Come posso approfondire questo argomento?",
                    back: "Rileggi il documento e crea le tue note personali."
                }
            ];
            
            allFlashcards.push(...fallbackFlashcards);
        }

        sendEvent(2, 90, `Flashcard: ${allFlashcards.length} ✓`);
        sendEvent(3, 95, `Quiz: ${allQuizzes.length} ✓`);

        console.log('✅ Total flashcards:', allFlashcards.length);
        console.log('✅ Total quizzes:', allQuizzes.length);

        sendEvent(4, 100, "Tutto pronto! 🚀");
        
        safeWrite(`data: ${JSON.stringify({
            done: true,
            flashcard: JSON.stringify(allFlashcards),
            quiz: JSON.stringify(allQuizzes),
            extractedText: extractedTextFromPdf
        })}\n\n`);
        
        safeEnd();

        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
            await fs.promises.unlink(filePath);
            console.log('✅ Deleted original file');
        } catch (err: any) {
            console.warn('⚠️ Could not delete original file:', err.message);
        }

        console.log('✅ Upload completed successfully');

    } catch (error: any) {
        console.error("❌ Errore server:", error);
        
        if (!responseEnded) {
            safeWrite(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            safeEnd();
        }
        
        if (req.file?.path) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                await fs.promises.unlink(req.file.path);
            } catch {}
        }
    }
})

app.post("/api/chat", async function(req, res) {
    const prompt = req.body.message || req.body.prompt
    const testo = req.body.context || req.body.testoDocumento

    console.log('💬 Chat request');
    console.log('   Message:', prompt?.substring(0, 100));
    console.log('   Context size:', testo?.length || 0);
    
    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ 
            success: false, 
            error: "Message is required" 
        });
    }
    
    try {
        let fullPrompt;
        
        if (testo && testo.length > 0) {
            fullPrompt = `Sei un tutor AI esperto che aiuta studenti a studiare.
            HAI ACCESSO AL SEGUENTE DOCUMENTO:

            ===== DOCUMENTO =====
            ${testo.substring(0, 100000)}
            ===== FINE DOCUMENTO =====

            ISTRUZIONI:
            1. Rispondi basandoti sul documento
            2. Sii chiaro e conciso
            3. Usa esempi dal documento

            DOMANDA: ${prompt}

            RISPOSTA:`;
                    } else {
                        fullPrompt = `Sei un tutor AI. Lo studente non ha caricato documenti. Invitalo gentilmente a caricare un PDF.
            DOMANDA: ${prompt}
            RISPOSTA:`
                    }
        
        console.log('🤖 Calling Gemini...');
        
        const response = await genAI.models.generateContent({
            model: "gemini-flash-lite-latest",
            contents: fullPrompt
        });
        
        console.log('✅ Response generated')
        
        res.json({
            success: true,
            response: response.text
        });
        
    } catch (error: any) {
        console.error('❌ Chat error:', error)
        res.status(500).json({
            success: false,
            error: 'Errore nella generazione della risposta'
        });
    }
})

app.post("/api/create-ai-plane", upload.single("file"), async function(req, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (step: number, pct: number, msg: string) => {
        res.write(`data: ${JSON.stringify({ step, pct, msg })}\n\n`);
    };

    let responseEnded = false;
    
    const safeEnd = () => {
        if (!responseEnded) {
            res.end();
            responseEnded = true;
        }
    };
    
    const safeWrite = (data: string) => {
        if (!responseEnded) {
            res.write(data);
        }
    };

    try {
        const filePath: any = req.file?.path;
        const mimeType = req.file?.mimetype;

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(mimeType!)) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await fs.promises.unlink(filePath);
            
            safeWrite(`data: ${JSON.stringify({ error: "Tipo file non supportato. Usa PDF, JPG o PNG" })}\n\n`);
            return safeEnd();
        }

        sendEvent(1, 10, "Lettura del file...");

        let extractedTextFromPdf: string;
        
        try {
            if (mimeType!.startsWith('image/')) {
                sendEvent(1, 15, "🔍 Riconoscimento testo con OCR...");
            } else {
                sendEvent(1, 15, "Estrazione testo in corso...");
            }
            
            extractedTextFromPdf = await extractText(filePath, mimeType!);
            
            if (!extractedTextFromPdf || extractedTextFromPdf.length < 50) {
                throw new Error('Testo estratto insufficiente. Assicurati che il documento contenga testo leggibile.');
            }
            
            sendEvent(1, 35, "Testo estratto con successo");
            console.log('✅ Extracted text:', extractedTextFromPdf.length, 'chars');
            
        } catch (extractError: any) {
            console.error('❌ Text extraction failed:', extractError);
            
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                await fs.promises.unlink(filePath);
            } catch {}
            
            safeWrite(`data: ${JSON.stringify({ 
                error: extractError.message || 'Estrazione testo fallita'
            })}\n\n`);
            return safeEnd();
        }

        const MAX_CHARS = 70000;
        const chunks: string[] = [];
        
        for (let i = 0; i < extractedTextFromPdf.length; i += MAX_CHARS) {
            chunks.push(extractedTextFromPdf.substring(i, i + MAX_CHARS));
        }

        console.log('📚 Processing', chunks.length, 'chunks...');
        sendEvent(2, 40, "Generazione flashcard e quiz...");

        // ✅ GENERAZIONE CON RETRY
        const flashcardPromises = chunks.map(async (chunk, index) => {
            const promptFlashcard = `Sei un assistente educativo. Analizza il testo e genera flashcard di studio.
                TESTO:
                """
                ${chunk.substring(0, 60000)}
                """

                ISTRUZIONI CRITICHE:
                1. Genera quante più flashcard possibili che abbiano senso ma massimo 20
                2. Ogni domanda deve essere chiara e specifica
                3. Ogni risposta deve essere accurata e completa
                4. Usa SOLO questo formato JSON (niente testo extra, niente markdown):

                [
                {"front": "Prima domanda?", "back": "Prima risposta dettagliata"},
                {"front": "Seconda domanda?", "back": "Seconda risposta dettagliata"},
                {"front": "Terza domanda?", "back": "Terza risposta dettagliata"},
                {"front": "Quarta domanda?", "back": "Quarta risposta dettagliata"},
                {"front": "Quinta domanda?", "back": "Quinta risposta dettagliata"}
                ]

                IMPORTANTE: Rispondi SOLO con l'array JSON, nient'altro.`;

            try {
                const items = await generateWithRetry(promptFlashcard, 'flashcard');
                console.log(`✅ Flashcard chunk ${index + 1}: ${items.length} valid`);
                return items;
            } catch (error: any) {
                console.error(`❌ Flashcard chunk ${index + 1} failed:`, error.message);
                return [];
            }
        });

        const quizPromises = chunks.map(async (chunk, index) => {
            const promptQuiz = `Sei un assistente educativo. Analizza il testo e genera quiz a risposta multipla.
            TESTO:
            """
            ${chunk.substring(0, 60000)}
            """

            ISTRUZIONI CRITICHE:
            1. Genera quanti più quiz possibili che abbiano senso
            2. Ogni quiz deve avere 4 opzioni
            3. Solo 1 risposta corretta per quiz
            4. Usa SOLO questo formato JSON (niente testo extra, niente markdown):

            [
            {"question": "Prima domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 0},
            {"question": "Seconda domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 1},
            {"question": "Terza domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 2},
            {"question": "Quarta domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 3},
            {"question": "Quinta domanda?", "options": ["Risposta A", "Risposta B", "Risposta C", "Risposta D"], "correct": 0}
            ]

            IMPORTANTE:
            - "correct" deve essere 0, 1, 2, o 3 (indice dell'opzione corretta)
            - Rispondi SOLO con l'array JSON, nient'altro.`;

            try {
                const items = await generateWithRetry(promptQuiz, 'quiz');
                console.log(`✅ Quiz chunk ${index + 1}: ${items.length} valid`);
                return items;
            } catch (error: any) {
                console.error(`❌ Quiz chunk ${index + 1} failed:`, error.message);
                return [];
            }
        });

        sendEvent(2, 50, "Elaborazione in corso...");
        
        const [flashcardResults, quizResults] = await Promise.all([
            Promise.all(flashcardPromises),
            Promise.all(quizPromises)
        ]);

        const allFlashcards = flashcardResults.flat();
        const allQuizzes = quizResults.flat();

        sendEvent(3, 90, "Generazione piano di studio AI...");

        let studyPlanData = null;

        try {
            const planPrompt = `
            Sei un sistema esperto di didattica. Il tuo compito è generare un piano di studio completo e bilanciato basato sul TESTO FORNITO.

            TESTO DA ANALIZZARE:
            """
            ${chunks}
            """

            REGOLE RIGOROSE:
            1. COMPOSIZIONE PIANO (TIMELINE):
            - Il piano dovrebbe includere tutte e 4 le tipologie di attività: 'studio', 'flashcard', 'quiz', 'exam'.
            - Struttura la timeline in modo logico: inizia con 'studio', prosegue con 'flashcard', approfondisce con 'quiz' e conclude con 'exam' per esempio.
            - Puoi generare da 4 a 6 step totali. Se il testo è lungo, aggiungi step di 'studio' extra.

            2. SPECIFICHE ATTIVITÀ:
            - Ogni step deve avere: day, title, description, duration, type, difficulty, priority.
            - SE tipo è 'studio' o 'mixed': includi 'content' con il TESTO INTEGRALE ORIGINALE (usa tag HTML <h3>, <p>, <code>).
            - SE tipo è 'quiz': includi 'quizList' (vettore di oggetti: {"question": "...", "options": ["A", "B", "C", "D"], "correct": 0}).
            - SE tipo è 'flashcard': includi 'flashcardList' (vettore di oggetti: {"front": "...", "back": "..."}).

            3. NEXT ACTION:
            - Imposta 'nextAction' come: { "title": "titolo_del_primo_step" }.

            4. FORMATO JSON (STRUTTURA OBBLIGATORIA):
            {
            "documentName": "Nome breve",
            "topics": ["argomento1", "argomento2"],
            "difficulty": "Facile | Intermedia | Difficile",
            "difficultyReason": "Giustificazione basata sul contenuto",
            "estimatedTime": "es: 6 ore",
            "stats": { "pagesAnalyzed": 0, "sessions": "4-6", "completion": "X giorni" },
            "risk": { "level": "Basso | Medio | Alto", "message": "Punto critico" },
            "strategy": "Active Recall e Spaced Repetition",
            "mastery": 0,
            "timeline": [
                {
                "day": "...",
                "title": "...",
                "description": "...",
                "duration": "...",
                "type": "studio | flashcard | quiz | exam",
                "content": "TESTO INTEGRALE O VUOTO",
                "quizList": [ ... ],
                "flashcardList": [ ... ]
                }
            ],
            "nextAction": { "title": "..." }
            }

            IMPORTANTE: Restituisci ESCLUSIVAMENTE un oggetto JSON valido. Non inserire markdown, non aggiungere spiegazioni testuali prima o dopo il blocco JSON.
            `;
            
            const planResult = await generateWithRetry(planPrompt, 'plan');
            
            studyPlanData = planResult;

            for (let step of studyPlanData.timeline) {
            // Inizializza forzatamente come stringa vuota se non esiste
            step.content = ""; 

            if (step.type === 'studio' || step.type === 'mixed') {
                sendEvent(3, 92, `Estrazione contenuto per: ${step.title}...`);
                
                const extractionPrompt = `
                Sei un curatore di contenuti. 
                TESTO ORIGINALE: ${extractedTextFromPdf}
                ARGOMENTO DA ESTRARRE: ${step.title}
                
                ISTRUZIONE: 
                Estrai dal testo originale TUTTO il contenuto pertinente a questo argomento. 
                NON RIASSUMERE. NON ELENCARE. Copia il testo integrale, includendo codice ed esempi.
                Formattalo SOLO con tag HTML (<h3>, <p>, <code>, <ul>, <li>).
                
                RISPONDI SOLO CON IL TESTO HTML. NON AGGIUNGERE ALTRO TESTO.`;

                // USIAMO LA FUNZIONE RAW
                const contentHtml = await generateRawContent(extractionPrompt);
                step.content = contentHtml;
            }
        }

        // 3. AGGIORNAMENTO NEXT ACTION (Sincronizzazione finale)
        const firstActive = studyPlanData.timeline.find((s:any) => s.type === 'studio' || s.type === 'mixed');
        if (firstActive) {
            studyPlanData.nextAction = {
                ...firstActive, // Prende il contenuto appena popolato
                priority: "Alta"
            };
        }
            
            console.log('✅ Study plan generated');
        } catch (error: any) {
            console.error('❌ Study plan failed:', error.message);
            
            // fallback intelligente
            studyPlanData = {
                documentName: "Documento caricato",
                topics: ["Argomento principale"],
                difficulty: "Intermedia",
                difficultyReason: "Contenuto standard",
                estimatedTime: "4-6 ore",
                stats: {
                    pagesAnalyzed: 0,
                    keywords: 0,
                    sessions: "5-8",
                    completion: "5 giorni"
                },
                risk: {
                    level: "Medio",
                    message: "Richiede studio costante"
                },
                strategy: "Studio progressivo",
                studyPlan: []
            };
        }

        // ✅ FALLBACK: Se poche flashcard/quiz, genera minimo garantito
        if (allFlashcards.length < 3) {
            console.warn('⚠️ Too few flashcards, generating fallback...');
            sendEvent(2, 70, "Generazione flashcard aggiuntive...");
            
            const fallbackFlashcards = [
                {
                    front: "Qual è il tema principale del documento?",
                    back: extractedTextFromPdf.substring(0, 200) + "..."
                },
                {
                    front: "Quali sono i punti chiave trattati?",
                    back: "Il documento tratta vari argomenti che richiedono studio approfondito."
                },
                {
                    front: "Come posso approfondire questo argomento?",
                    back: "Rileggi il documento e crea le tue note personali."
                }
            ];
            
            allFlashcards.push(...fallbackFlashcards);
        }

        sendEvent(2, 90, `Flashcard: ${allFlashcards.length} ✓`);
        sendEvent(3, 95, `Quiz: ${allQuizzes.length} ✓`);

        console.log('✅ Total flashcards:', allFlashcards.length);
        console.log('✅ Total quizzes:', allQuizzes.length);

        sendEvent(4, 100, "Tutto pronto! 🚀");
        
        safeWrite(`data: ${JSON.stringify({
        done: true,
        flashcard: JSON.stringify(allFlashcards),
        quiz: JSON.stringify(allQuizzes),
        plan: studyPlanData,
        extractedText: extractedTextFromPdf
    })}\n\n`);
        
        safeEnd();

        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
            await fs.promises.unlink(filePath);
            console.log('✅ Deleted original file');
        } catch (err: any) {
            console.warn('⚠️ Could not delete original file:', err.message);
        }

        console.log('✅ Upload completed successfully');

    } catch (error: any) {
        console.error("❌ Errore server:", error);
        
        if (!responseEnded) {
            safeWrite(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            safeEnd();
        }
        
        if (req.file?.path) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                await fs.promises.unlink(req.file.path);
            } catch {}
        }
    }
})

app.post("/api/saveStudyData", async function(req, res) {
    const client = new MongoClient(connectionString!);
    
    try {
        await client.connect();
        const db = client.db(dbName);
        
        // 1. Recuperiamo i dati dal body e l'ID utente dal token (o dal body per test)
        // Assumo che tu abbia il userId disponibile (es. da un middleware di autenticazione)
        const userId = req.body.userId
        const { extractedText, plan, flashcard, quiz } = req.body;

        // 2. Parsiamo le stringhe JSON che arrivano dal frontend
        const flashcardsArray = JSON.parse(flashcard);
        const quizArray = JSON.parse(quiz);

        // --- OPERAZIONE 1: Salva il Materiale (Il "Contenitore") ---
        const materialResult = await db.collection("plan").insertOne({
            titolo: plan.documentName || "Nuovo Materiale",
            pianoStudio: plan,
            testoEstratto: extractedText,
            dataCreazione: new Date(),
            userId: new ObjectId(userId)
        });

        const materialId = materialResult.insertedId;

        // --- OPERAZIONE 2: Salva le Flashcard ---
        // Aggiungiamo il materialId e userId a ogni singola flashcard
        const flashcardsToSave = flashcardsArray.map((f:any) => ({
            ...f,
            materialId: materialId,
            userId:  new ObjectId(userId)
        }));
        
        if (flashcardsToSave.length > 0) {
            await db.collection("flashcards").insertMany(flashcardsToSave);
        }

        // --- OPERAZIONE 3: Salva i Quiz ---
        const quizToSave = quizArray.map((q:any) => ({
            ...q,
            materialId: materialId,
            userId:  new ObjectId(userId)
        }));

        if (quizToSave.length > 0) {
            await db.collection("quizzes").insertMany(quizToSave);
        }

        // Risposta di successo
        res.status(200).send({
            message: "Tutto salvato con successo!",
            materialId: materialId,
            titoloMateriale:plan.documentName
        });

    } catch (err:any) {
        console.error("Errore durante il salvataggio:", err);
        res.status(500).send("Errore interno del server: " + err.message);
    } finally {
        await client.close();
    }
});

//2. Controllo token
//la richiamo solo quando richiedo una risorsa /api
app.use("/api", function(req:any,res,next){
    //cookie è la collezione dei cookies, andiamo a vedere se nella collezione
    //dei cookies c'è un cookie chiamato token
    if(!req.cookies || !req.cookies.TOKEN)
        res.status(403).send("Token mancante")
    else{
        let token = req.cookies.TOKEN
        jwt.verify(token, jwtKey, function(err:any, payload: any){
            if(err){
                console.log("Token scaduto o non valido")
                res.status(403).send("Token non valido o scaduto")
            }
            else{
                //serve a fare in modo che il tempo di scadenza del token sia
                //aggiornato ricreando il token
                const newToken = createToken(payload)
                res.cookie("TOKEN",newToken,cookiesOption)
                req["username"] = payload.username
                next()
            }
        })
    }
})

app.get("/api/getPlanQuizFlashcard", async function(req, res, next) {
  const id: any = req.query.id;
  const title:string = req.query.title as string
  const client = new MongoClient(connectionString!);

  await client.connect().catch(function(err) {
    res.status(503).send("Errore di connessione al dbms");
    return;
  });

  try {
    const db = client.db(dbName);

    const [plan, quizzes, flashcards] = await Promise.all([
      db.collection("plan").findOne({ "userId": new ObjectId(id), "titolo":title }),
      db.collection("quizzes").find({ "userId": new ObjectId(id) }).toArray(),
      db.collection("flashcards").find({ "userId": new ObjectId(id) }).toArray()
    ]);

    res.send({ plan, quizzes, flashcards });
  } catch(err) {
    res.status(500).send("Errore esecuzione query: " + err);
  } finally {
    client.close();
  }
});

app.patch("/api/cambiaNextAction", async function(req, res, next) {
  const title: any = req.body.title;
  const userId:any = req.body.userId
  const client = new MongoClient(connectionString!);

  await client.connect().catch(function(err) {
    res.status(503).send("Errore di connessione al dbms");
    return;
  });

    const db = client.db(dbName)
    const collection = client.db(dbName).collection("plan")
    const cmd = collection.findOne({userId:new ObjectId(userId),titolo:title})

    cmd.then(function(data){
        //res.send(data)
        console.log(data)
        const plan:any = data
        const currentIndex = plan?.pianoStudio.timeline.findIndex((s:any) => s.title === plan.pianoStudio.nextAction.title);
        const isLastAction = plan.pianoStudio.timeline.length - 1 == currentIndex
        console.log(currentIndex)
        console.log(isLastAction)

        const nextStep = plan?.pianoStudio.timeline[currentIndex + 1];

        // 4. Aggiorna la nextAction usando SOLO il titolo come puntatore
        plan.pianoStudio.nextAction = nextStep

        // 5. Salva nel DB (modifica con il tuo metodo di salvataggio)
        const cmdUpdate = collection.updateOne({userId:new ObjectId(userId)},{$set:{"pianoStudio.nextAction":plan.pianoStudio.nextAction}})

        cmdUpdate.then(function(data){
            console.log(data)
            res.send({ 
            success: true, 
            nextAction: plan.pianoStudio.nextAction,
            fullDetails: nextStep, // Inviamo anche i dettagli per aggiornare la UI
            isLastAction,
            titoloDocumento:title
        });
        })

        cmdUpdate.catch(function(err){
            res.status(500).send("Errore esecuzione 2 query: " + err)
        })

        cmdUpdate.finally(function(){
            client.close()
        })
    })

    cmd.catch(function(err){
        res.status(500).send("Errore esecuzione query: " + err)
    })
});

app.get("/api/checkToken",async function(req,res,next){
    console.log(req.cookies)
    res.send({"token":req.cookies.TOKEN})
})

// ============================================
// EXTRACT JSON - VERSIONE SUPER ROBUSTA
// ============================================

function extractJSON(text: string, type: string): any[] {
    console.log(`🔍 Extracting ${type} JSON...`);
    
    if (!text || typeof text !== 'string') {
        return [];
    }
    
    try {
        let cleaned = text
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');

        if (start === -1 || end === -1) {
            return [];
        }

        cleaned = cleaned.substring(start, end + 1);

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            cleaned = cleaned
                .replace(/'/g, '"')
                .replace(/,\s*([}\]])/g, '$1');
            parsed = JSON.parse(cleaned);
        }

        const result = Array.isArray(parsed) ? parsed : [parsed];

        const validated = result.filter(item => {
            if (type === 'flashcard') return validateFlashcard(item);
            if (type === 'quiz') return validateQuiz(item);
            return true; // ✅ FIX
        });

        console.log(`✅ Validated ${validated.length}/${result.length}`);
        return validated;

    } catch (err: any) {
        console.error('❌ JSON extract error:', err.message);
        return [];
    }
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

function validateFlashcard(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    
    const hasValidFront = 
        item.front && 
        typeof item.front === 'string' && 
        item.front.trim().length >= 3 &&
        item.front.trim().length <= 500;
    
    const hasValidBack = 
        item.back && 
        typeof item.back === 'string' && 
        item.back.trim().length >= 3 &&
        item.back.trim().length <= 1000;
    
    return hasValidFront && hasValidBack;
}

function validateQuiz(item: any): boolean {
    if (!item || typeof item !== 'object') return false;
    
    const hasValidQuestion = 
        item.question && 
        typeof item.question === 'string' && 
        item.question.trim().length >= 5 &&
        item.question.trim().length <= 500;
    
    const hasValidOptions = 
        Array.isArray(item.options) &&
        item.options.length === 4 &&
        item.options.every((opt: any) => 
            typeof opt === 'string' && 
            opt.trim().length > 0 &&
            opt.trim().length <= 200
        );
    
    const hasValidCorrect = 
        typeof item.correct === 'number' &&
        Number.isInteger(item.correct) &&
        item.correct >= 0 &&
        item.correct <= 3;
    
    return hasValidQuestion && hasValidOptions && hasValidCorrect;
}

// ============================================
// OCR CON TESSERACT
// ============================================

async function extractTextWithOCR(filePath: string): Promise<string> {
    let worker: Tesseract.Worker | null = null;
    
    try {
        console.log('🔍 Starting OCR with Tesseract for:', filePath);
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        worker = await createWorker('ita', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });
        
        const { data: { text } } = await worker.recognize(filePath);
        
        await worker.terminate();
        worker = null;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const cleanedText = text
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[^\x00-\x7F\u00C0-\u00FF\n\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        console.log('✅ OCR completed:', cleanedText.length, 'chars');
        console.log('📝 OCR Text Preview:', cleanedText.substring(0, 200));
        
        return cleanedText;
        
    } catch (error: any) {
        console.error('❌ OCR error:', error);
        
        if (worker) {
            try {
                await worker.terminate();
            } catch {}
        }
        
        throw new Error('OCR fallito: ' + error.message);
    }
}

// ============================================
// UNIVERSAL TEXT EXTRACTION
// ============================================

async function extractText(filePath: string, mimeType: string): Promise<string> {
    console.log('📄 Extracting text from:', mimeType);
    
    if (mimeType === 'application/pdf') {
        try {
            const dataBuffer = await fs.promises.readFile(filePath);
            const uint8Array = new Uint8Array(dataBuffer);
            const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
            
            let text = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                text += content.items.map((item: any) => item.str).join(' ') + '\n';
            }
            
            text = text.replace(/\s+/g, ' ').trim();
            
            if (text.length < 100) {
                console.warn('⚠️ PDF appears to be scanned, using OCR...');
                return await extractTextWithOCR(filePath);
            }
            
            return text;
            
        } catch (error) {
            console.error('❌ PDF extraction failed:', error);
            throw error;
        }
    }
    
    if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/jpg') {
        return await extractTextWithOCR(filePath);
    }
    
    throw new Error('Tipo file non supportato: ' + mimeType);
}

// ============================================
// GENERATE WITH RETRY
// ============================================

async function generateWithRetry(
    prompt: string, 
    type: string,
    maxRetries: number = 2
): Promise<any> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🤖 AI attempt ${attempt}/${maxRetries} for ${type}...`);
            
            const response = await genAI.models.generateContent({
                model: "gemini-flash-lite-latest",
                contents: prompt,
                config: {
                    temperature: 0.2,
                    topP: 0.8,
                    topK: 40
                }
            });
            
            if (!response || !response.text) {
                throw new Error('Empty response from AI');
            }
            
            const text = response.text.trim();
            console.log(`📝 Raw AI response (${text.length} chars):`, text.substring(0, 200));

            // ✅ PLAN = OGGETTO JSON
            if (type === 'plan') {
                try {
                    const cleaned = text
                        .replace(/```json/gi, '')
                        .replace(/```/g, '')
                        .trim();

                    const start = cleaned.indexOf('{');
                    const end = cleaned.lastIndexOf('}');

                    if (start === -1 || end === -1) {
                        throw new Error("No JSON object found");
                    }

                    const jsonString = cleaned.substring(start, end + 1);
                    const parsed = JSON.parse(jsonString);

                    console.log("✅ Plan parsed correctly");
                    return parsed;

                } catch (err: any) {
                    console.error("❌ Plan parse error:", err.message);
                    throw err;
                }
            }

            // ✅ FLASHCARD / QUIZ
            const items = extractJSON(text, type);

            if (items.length > 0) {
                console.log(`✅ Success: ${items.length} ${type}s extracted`);
                return items;
            }
            
            console.warn(`⚠️ Attempt ${attempt}: No valid items extracted`);

            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }

        } catch (error: any) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);

            if (attempt === maxRetries) {
                throw error;
            }

            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    return type === 'plan' ? null : [];
}

// Aggiungi questa funzione nel tuo file
async function generateRawContent(prompt:any) {
    // Qui devi chiamare il tuo provider AI (es. OpenAI/Anthropic)
    // L'importante è che NON esegua JSON.parse() sul risultato
    const response = await genAI.models.generateContent({
                model: "gemini-flash-lite-latest",
                contents: prompt,
                config: {
                    temperature: 0.2,
                    topP: 0.8,
                    topK: 40
                }
            });
    return response.text?.trim(); // Restituisce solo la stringa, niente parser
}

app.use("/",function(req,res,next){
    res.status(404)
    if(!req.originalUrl.startsWith("/api/")){
        res.send(paginaErrore)
    }
    else{
        res.send("Risorsa non trovata")
    }
})

app.use("/",function(err:Error,req:express.Request,res:express.Response,next:NextFunction){
    console.log("*****ERRORE*****\n" + err.stack)
    res.status(500).send(err.message)
})