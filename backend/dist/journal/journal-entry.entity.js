"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JournalEntry = void 0;
const typeorm_1 = require("typeorm");
let JournalEntry = class JournalEntry {
    id;
    userId;
    timestamp;
    factorTag;
    intensity;
    note;
    createdAt;
};
exports.JournalEntry = JournalEntry;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], JournalEntry.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('varchar'),
    __metadata("design:type", String)
], JournalEntry.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], JournalEntry.prototype, "timestamp", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], JournalEntry.prototype, "factorTag", void 0);
__decorate([
    (0, typeorm_1.Column)('int'),
    __metadata("design:type", Number)
], JournalEntry.prototype, "intensity", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], JournalEntry.prototype, "note", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], JournalEntry.prototype, "createdAt", void 0);
exports.JournalEntry = JournalEntry = __decorate([
    (0, typeorm_1.Entity)('journal_entries'),
    (0, typeorm_1.Index)(['userId', 'timestamp'])
], JournalEntry);
//# sourceMappingURL=journal-entry.entity.js.map