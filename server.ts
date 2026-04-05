"use strict"

import http from "http"
import https from "https"
import fs from "fs"
import express, { CookieOptions, NextFunction } from "express"
import dotenv from "dotenv"
import {MongoClient} from "mongodb"
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
            
            sendEvent(1, 35, "Testo estratto con successo ✓");
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
});

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
            model: "gemini-2.5-flash",
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

function extractJSON(text: string, type: 'flashcard' | 'quiz'): any[] {
    console.log(`🔍 Extracting ${type} JSON...`);
    
    if (!text || typeof text !== 'string') {
        console.warn('⚠️ Empty or invalid text');
        return [];
    }
    
    try {
        // ✅ STEP 1: Pulizia base
        let cleaned = text
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .replace(/^[^[{]*/, '') // Rimuovi tutto prima di [ o {
            .replace(/[^}\]]*$/, '') // Rimuovi tutto dopo ] o }
            .trim();
        
        // ✅ STEP 2: Trova array JSON
        const startBracket = cleaned.indexOf('[');
        const endBracket = cleaned.lastIndexOf(']');
        
        if (startBracket !== -1 && endBracket !== -1 && startBracket < endBracket) {
            cleaned = cleaned.substring(startBracket, endBracket + 1);
        } else {
            console.warn('⚠️ No valid JSON array found');
            return [];
        }
        
        // ✅ STEP 3: Normalizza spazi
        cleaned = cleaned
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // ✅ STEP 4: Tentativi multipli di parsing
        let parsed: any = null;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!parsed && attempts < maxAttempts) {
            attempts++;
            
            try {
                // Tentativo corrente
                let current = cleaned;
                
                switch(attempts) {
                    case 1:
                        // Parsing diretto
                        current = cleaned;
                        break;
                        
                    case 2:
                        // Fix virgolette
                        current = cleaned.replace(/'/g, '"');
                        break;
                        
                    case 3:
                        // Fix virgole trailing
                        current = cleaned
                            .replace(/,\s*([}\]])/g, '$1')
                            .replace(/'/g, '"');
                        break;
                        
                    case 4:
                        // Fix escape
                        current = cleaned
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\')
                            .replace(/,\s*([}\]])/g, '$1')
                            .replace(/'/g, '"');
                        break;
                        
                    case 5:
                        // Ricostruzione manuale
                        current = manualJSONReconstruction(cleaned, type);
                        break;
                }
                
                parsed = JSON.parse(current);
                console.log(`✅ Parsed on attempt ${attempts}`);
                
            } catch (error: any) {
                console.log(`❌ Attempt ${attempts} failed:`, error.message.substring(0, 100));
            }
        }
        
        if (!parsed) {
            console.error('❌ All parsing attempts failed');
            return [];
        }
        
        // ✅ STEP 5: Validazione struttura
        const result = Array.isArray(parsed) ? parsed : [parsed];
        
        const validated = result.filter(item => {
            if (type === 'flashcard') {
                return validateFlashcard(item);
            } else {
                return validateQuiz(item);
            }
        });
        
        console.log(`✅ Validated ${validated.length}/${result.length} items`);
        
        return validated;
        
    } catch (error: any) {
        console.error('❌ Fatal extraction error:', error.message);
        return [];
    }
}

// ============================================
// MANUAL JSON RECONSTRUCTION
// ============================================

function manualJSONReconstruction(text: string, type: 'flashcard' | 'quiz'): string {
    console.log('🔧 Attempting manual JSON reconstruction...');
    
    try {
        if (type === 'flashcard') {
            // Cerca pattern: "front": "...", "back": "..."
            const frontRegex = /"front"\s*:\s*"([^"]+)"/g;
            const backRegex = /"back"\s*:\s*"([^"]+)"/g;
            
            const fronts = [...text.matchAll(frontRegex)].map(m => m[1]);
            const backs = [...text.matchAll(backRegex)].map(m => m[1]);
            
            const items = [];
            const len = Math.min(fronts.length, backs.length);
            
            for (let i = 0; i < len; i++) {
                items.push({
                    front: fronts[i],
                    back: backs[i]
                });
            }
            
            return JSON.stringify(items);
            
        } else {
            // Cerca pattern quiz
            const questionRegex = /"question"\s*:\s*"([^"]+)"/g;
            const optionsRegex = /"options"\s*:\s*\[([^\]]+)\]/g;
            const correctRegex = /"correct"\s*:\s*(\d+)/g;
            
            const questions = [...text.matchAll(questionRegex)].map(m => m[1]);
            const optionsSets = [...text.matchAll(optionsRegex)].map(m => {
                return m[1]!.split(',').map(opt => 
                    opt.trim().replace(/^["']|["']$/g, '')
                );
            });
            const corrects = [...text.matchAll(correctRegex)].map(m => parseInt(m[1]!));
            
            const items = [];
            const len = Math.min(questions.length, optionsSets.length, corrects.length);
            
            for (let i = 0; i < len; i++) {
                if (optionsSets[i]!.length === 4) {
                    items.push({
                        question: questions[i],
                        options: optionsSets[i],
                        correct: corrects[i]
                    });
                }
            }
            
            return JSON.stringify(items);
        }
        
    } catch (error) {
        console.error('❌ Manual reconstruction failed');
        return '[]';
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
    type: 'flashcard' | 'quiz',
    maxRetries: number = 1
): Promise<any[]> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🤖 AI attempt ${attempt}/${maxRetries} for ${type}...`);
            
            const response = await genAI.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    temperature: 0.3, // Più deterministico
                    topP: 0.8,
                    topK: 40
                }
            });
            
            if (!response || !response.text) {
                throw new Error('Empty response from AI');
            }
            
            const text = response.text;
            console.log(`📝 Raw AI response (${text.length} chars):`, text.substring(0, 200));
            
            const items = extractJSON(text, type);
            
            if (items.length > 0) {
                console.log(`✅ Success: ${items.length} ${type}s extracted`);
                return items;
            }
            
            console.warn(`⚠️ Attempt ${attempt}: No valid items extracted, retrying...`);
            
            // Aspetta prima di ritentare
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
            
        } catch (error: any) {
            console.error(`❌ Attempt ${attempt} failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    
    return [];
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