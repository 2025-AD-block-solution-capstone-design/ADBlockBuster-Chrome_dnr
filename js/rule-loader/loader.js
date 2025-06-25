import fs from 'fs';


const loadFromFile = async (path) => {
    const lines = fs.readFileSync(path, "utf-8").split("\n");
}