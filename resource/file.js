export class FileStreamHandler {
    constructor(fileName = "data_stream.bin") {
        this.fileName = fileName;
        this.writableStream = null;
    }

    /**
     * Opens a file stream for writing data.
     * @returns {Promise<void>}
     */
    async openFileStream() {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: this.fileName,
                types: [{
                    description: 'Binary Files',
                    accept: { 'application/octet-stream': ['.bin'], 'text/plain': ['.txt'] }
                }]
            });
            this.writableStream = await fileHandle.createWritable();
            console.log(`file stream opened for: ${this.fileName}`);

            return true;
        } catch (error) {
            console.error(`error opening file stream: ${error}`);
            return false;
        }
    }

    /**
     * Streams data directly to the file.
     * @param {ArrayBuffer|Uint8Array|string} data - The data to stream.
     * @returns {Promise<void>}
     */
    async streamData(data) {
        if (!this.writableStream) {
            console.error(`file stream not opened. Call openFileStream() first`);
            return;
        }

        try {
            // Ensure data is in the correct format before writing
            if (typeof data === "string") {
                data = new TextEncoder().encode(data); // Convert string to binary
            }

            await this.writableStream.write(data);
            console.log(`data streamed to ${this.fileName} successfully`);
        } catch (error) {
            console.error(`error streaming data: ${error}`);
        }
    }

    /**
     * Closes the file stream.
     * @returns {Promise<void>}
     */
    async closeFileStream() {
        if (this.writableStream) {
            await this.writableStream.close();
            this.writableStream = null;
            console.log(`file stream closed for: ${this.fileName}`);
        } else {
            console.warn(`no open stream to close for: ${this.fileName}`);
        }
    }
}
