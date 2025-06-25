import fs from "fs";
import https from "https";

export const downloadFile = (url, dest, cb) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
        if (res.statusCode !== 200) return console.error("DL fail", res.statusCode);
        res.pipe(file).on("finish", () => file.close(cb));
    }).on("error", e => {
        fs.unlink(dest, () => {
        });
        console.error(e);
    });
}

export const extractVersion = (path) => {
    return fs.readFileSync(path, "utf-8")
        .split("\n")
        .find(l => l.startsWith("! Version:"))?.trim();
}
