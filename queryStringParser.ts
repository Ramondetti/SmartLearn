
/* NON E' CONSENTITO MODIFICARE REQ["QUERY"] CHE E' IN SOLA LETTURA,
   NON E' POSSIBILE NEANCHE MODICARE SINGOLAERMENTE IL CONTENUTO DELLE SUE*/

function parseQueryString(req:any,res:any,next:any){
    //con questa funziona andiamo a modificare req.query parsificando ogni valore
    req["parsedQuery"] = {}
    if(req["query"] && typeof req["query"] == "object"){
        for (const key in req["query"]) {
            const value = req["query"][key]
            req["parsedQuery"][key] = parseValue(value)
        }
    }
    next()
}

function parseValue(value:any){
    if(value == "true")
        return true
    if(value == "false")
        return false
    //number resituisce il numero solo se la stringa è
    //puramente un numero, parseInt no
    //15a con parseInt diventa 15
    //con number NaN
    //Number accetta interi e decimali
    const num = Number(value)
    //se è un numero valido ritorna il numero
    if(!isNaN(num))
        return num
    //type of Nan restituisce number quindi non funziona
    /*if(typeof num == "number")
        return num*/

    if(typeof value == "string" && (value.startsWith("{") || value.startsWith("["))){
        try{
            return JSON.parse(value)
        }
        catch(error){
            return value
        }
    }

    //se è una stringa
    return value
}

export default parseQueryString