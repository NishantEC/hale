export class AsyncQueue {
    constructor() {
        this.queue = [];
        this.resolvers = [];
    }

    /**
     * Adds an item to the queue.
     * @param {any} item - The item to be added.
     */
    enqueue(item) {
        if (this.resolvers.length > 0) {
            const resolve = this.resolvers.shift();
            resolve(item);
        } else {
            this.queue.push(item);
        }
    }

    /**
     * Removes and returns an item from the queue.
     * Waits if the queue is empty.
     * @returns {Promise<any>} - A promise that resolves with the next item.
     */
    async dequeue() {
        if (this.queue.length > 0) {
            return this.queue.shift();
        } else {
            return new Promise(resolve => this.resolvers.push(resolve));
        }
    }

    /**
     * Checks if the queue is empty.
     * @returns {boolean}
     */
    isEmpty() {
        return this.queue.length === 0;
    }

    /**
     * Returns the size of the queue.
     * @returns {number}
     */
    size() {
        return this.queue.length;
    }
}