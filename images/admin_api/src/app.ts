import express, { Request, Response } from 'express';
import * as bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

app.get('/', (req: Request, res: Response) => {
    console.log("Paso por get /");
    res.send('Hello World!!!');
});
app.get('/hola', (req: Request, res: Response) => {
    console.log("Paso por get /hola");
    res.send('Hello World!!! HOla');
});

export {app};
