"use strict"

resetForm.addEventListener("submit",function(e){
    e.preventDefault()
    msgPswErr.classList.add("hidden")
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if(newPassword.value == confirmPassword.value){
        const response = inviaRichiesta("PATCH","/reset-password-confirmed",{token,"nuovaPassword":newPassword.value})
        if(response.status == 200){
            console.log(response.data)
        }
        else
            console.error(response.status + " : " + response.err)
    }
    else
        msgPswErr.classList.remove("hidden")
})