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
    "sameSite":"none" //i cookie devono essere trasmessi oltre domain
}

app.post("/api/login",async function(req,res,next){
    const email = req.body.username
    const password = req.body.password

    const client = new MongoClient(connectionString!)
    await client.connect().catch(function(err){
        res.status(503).send("Errore di connessione al dbms")
        return
    })

    const collection = client.db(dbName).collection("utenti")

    const cmd = collection.findOne({"email":email})

    cmd.catch(function(err){
        res.status(500).send("Errore esecuzione query: " + err)
    })

    cmd.then(function(dbUser){ //gli indietta l'intero record utente (compresa la password)
        if(!dbUser)
            res.status(401).send("Username non valido")
        else{
            //console.log("Passord ricevuta: ", password, "Password DB: ", dbUser.password)
            bcrypt.compare(password,dbUser.password, function(err,ok){
                if(err){
                    res.status(500).send("bcrypt execution error")
                    console.log(err.stack)
                }
                else{
                    if(!ok)
                        res.status(401).send("Password non valida")
                    else{
                        const token = createToken(dbUser)
                        res.cookie("token",token,cookiesOption)
                        console.log("Cookie: ", res.getHeader("set-cookie"))
                        res.send({"_id":dbUser._id, "nome":dbUser.nome})
                    }
                }
            })
        }
    })

    cmd.finally(function(){
        client.close()
    })

})

function createToken(data:any){
    //getTime restituisce il TIME UNIX in millisecondi
    const now = Math.floor((new Date()).getTime()/1000)
    const payload = {
        "_id": data._id,
        "username": data.username,
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
        const token = createToken({
            "_id":data.insertedId,
            "email":email
        })
        res.cookie("token",token,cookiesOption)
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

        sendEvent(3, 96, "Generazione piano di studio AI...");

        let studyPlanData = null;

        try {
           const planPrompt = 
           `Sei un tutor AI esperto di apprendimento efficace.

            Analizza il testo e genera una diagnosi completa + piano di studio strutturato per una dashboard interattiva.

            TESTO:
            ${chunks}

            OBIETTIVO:
            Restituisci un JSON COMPLETO per popolare una dashboard moderna (diagnosi + piano + timeline + next action).
            IL TEMPO STIMATO DI STUDIO DEVE ESSERE REALISTICO

            FORMATO JSON OBBLIGATORIO (NESSUN testo extra):

            {
            "documentName": "Nome breve documento",

            "topics": ["argomento1", "argomento2", "argomento3"],

            "difficulty": "Facile | Intermedia | Difficile",
            "difficultyReason": "breve spiegazione",

            "estimatedTime": "es: 6 ore",

            "stats": {
                "pagesAnalyzed": numero,
                "keywords": numero,
                "sessions": "es: 8-12",
                "completion": "es: 7-10 giorni"
            },

            "risk": {
                "level": "Basso | Medio | Alto",
                "message": "spiegazione semplice"
            },

            "strategy": "es: Spaced Repetition + Quiz Mirati",

            "timeline": [
                {
                "day": "Oggi",
                "title": "Titolo breve",
                "description": "cosa fare",
                "duration": "es: 15 minuti",
                "type": "quiz | flashcard | mixed",
                "quizCount": numero,
                "flashcardCount": numero,
                "difficulty": "Facile | Intermedia | Difficile",
                "priority": "Alta | Media | Bassa",
                "successRate": numero (0-100)
                },
                {
                "day": "Domani",
                "title": "Titolo",
                "description": "descrizione",
                "duration": "es: 20 minuti",
                "type": "quiz | flashcard | mixed",
                "quizCount": numero,
                "flashcardCount": numero,
                "difficulty": "Facile | Intermedia | Difficile",
                "priority": "Media",
                "successRate": numero
                },
                {
                "day": "Tra 2 giorni",
                "title": "Titolo",
                "description": "descrizione",
                "duration": "es: 30 minuti",
                "type": "mixed",
                "quizCount": numero,
                "flashcardCount": numero,
                "difficulty": "Intermedia",
                "priority": "Media",
                "successRate": numero
                },
                {
                "day": "Tra 7 giorni",
                "title": "Esame simulato",
                "description": "test completo",
                "duration": "es: 45 minuti",
                "type": "exam",
                "quizCount": numero,
                "flashcardCount": 0,
                "difficulty": "Difficile",
                "priority": "Alta",
                "successRate": numero
                }
            ],

            "nextAction": {
                "title": "Titolo azione",
                "description": "spiegazione breve",
                "duration": "es: 15 minuti",
                "questions": numero,
                "difficulty": "Facile | Intermedia | Difficile"
            }
            }

            REGOLE IMPORTANTI:
            - 3-6 topic massimo
            - timeline di 3-4 step (non di più)
            - numeri realistici
            - linguaggio semplice
            - coerente con il testo
            - niente testo fuori dal JSON
            - JSON valido al 100%`
            
            const planResult = await generateWithRetry(planPrompt, 'plan');
            
            studyPlanData = planResult;
            
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
            _id: new ObjectId(userId),
            titolo: plan.documentName || "Nuovo Materiale",
            pianoStudio: plan,
            testoEstratto: extractedText,
            dataCreazione: new Date()
        });

        const materialId = materialResult.insertedId;

        // --- OPERAZIONE 2: Salva le Flashcard ---
        // Aggiungiamo il materialId e userId a ogni singola flashcard
        const flashcardsToSave = flashcardsArray.map((f:any) => ({
            ...f,
            materialId: materialId,
            userId: userId
        }));
        
        if (flashcardsToSave.length > 0) {
            await db.collection("flashcards").insertMany(flashcardsToSave);
        }

        // --- OPERAZIONE 3: Salva i Quiz ---
        const quizToSave = quizArray.map((q:any) => ({
            ...q,
            materialId: materialId,
            userId: userId
        }));

        if (quizToSave.length > 0) {
            await db.collection("quizzes").insertMany(quizToSave);
        }

        // Risposta di successo
        res.status(200).send({
            message: "Tutto salvato con successo!",
            materialId: materialId
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
    if(!req.cookies || !req.cookies.token)
        res.status(403).send("Token mancante")
    else{
        let token = req.cookies.token
        jwt.verify(token, jwtKey, function(err:any, payload: any){
            if(err){
                console.log("Token scaduto o non valido")
                res.status(403).send("Token non valido o scaduto")
            }
            else{
                //serve a fare in modo che il tempo di scadenza del token sia
                //aggiornato ricreando il token
                const newToken = createToken(payload)
                res.cookie("token",newToken,cookiesOption)
                req["username"] = payload.username
                next()
            }
        })
    }
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