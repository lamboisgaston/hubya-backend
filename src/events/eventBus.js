const { EventEmitter } = require("events");

const eventBus = new EventEmitter();

// Aumentamos el límite de listeners para evitar warnings cuando haya muchos consumidores.
eventBus.setMaxListeners(20);

module.exports = eventBus;
