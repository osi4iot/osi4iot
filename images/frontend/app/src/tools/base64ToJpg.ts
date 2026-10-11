export const base64ToJpg = (base64String: string) => {
    try {
        let cleanBase64 = base64String;
        
        // Si viene de JSON, quitar las comillas
        if (cleanBase64.startsWith('"') && cleanBase64.endsWith('"')) {
            cleanBase64 = cleanBase64.slice(1, -1);
        }
        
        // Quitar prefijo data:image si existe
        cleanBase64 = cleanBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        
        // Decodificar base64
        const byteCharacters = atob(cleanBase64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        const mimeType = "image/jpeg";
        return new Blob([byteArray], { type: mimeType });
        
    } catch (error) {
        console.error('Error al crear blob:', error);
        console.error('String recibido:', base64String.substring(0, 100) + '...');
        return null;
    }
}