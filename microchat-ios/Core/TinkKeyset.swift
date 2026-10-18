import Foundation

/// A deliberately narrow codec for the single public TINK key in MicroChat v1.
/// No private keyset, arbitrary protobuf type, rotated or legacy key is accepted.
enum Proto {
    enum Value { case number(UInt64), bytes(Data) }

    static func varint(_ input: UInt64) -> Data {
        var n = input
        var result = Data()
        repeat {
            let byte = UInt8(n & 127)
            n >>= 7
            result.append(byte | (n > 0 ? 128 : 0))
        } while n > 0
        return result
    }
    static func number(_ field: Int, _ value: UInt64) -> Data {
        varint(UInt64(field << 3)) + varint(value)
    }
    static func bytes(_ field: Int, _ value: Data) -> Data {
        varint(UInt64(field << 3 | 2)) + varint(UInt64(value.count)) + value
    }
    static func parse(_ input: Data) throws -> [Int: Value] {
        let input = [UInt8](input)
        guard input.count <= 4096 else { throw MicroChatError.invalidKeys }
        var position = 0
        func read() throws -> UInt64 {
            var value: UInt64 = 0
            for shift in stride(from: 0, through: 63, by: 7) {
                guard position < input.count else { throw MicroChatError.invalidKeys }
                let byte = input[position]; position += 1
                if shift == 63 && byte > 1 { throw MicroChatError.invalidKeys }
                value |= UInt64(byte & 127) << shift
                if byte & 128 == 0 { return value }
            }
            throw MicroChatError.invalidKeys
        }
        var fields: [Int: Value] = [:]
        while position < input.count {
            let tag = try read()
            guard tag >> 3 > 0, tag >> 3 <= 536_870_911 else { throw MicroChatError.invalidKeys }
            let field = Int(tag >> 3)
            guard fields[field] == nil else { throw MicroChatError.invalidKeys }
            switch tag & 7 {
            case 0: fields[field] = .number(try read())
            case 2:
                let length = try read()
                guard length <= UInt64(input.count - position) else { throw MicroChatError.invalidKeys }
                fields[field] = .bytes(Data(input[position ..< position + Int(length)])); position += Int(length)
            default: throw MicroChatError.invalidKeys
            }
        }
        return fields
    }
    static func getNumber(_ fields: [Int: Value], _ field: Int, default fallback: UInt64? = nil) throws -> UInt64 {
        if case .number(let value)? = fields[field] { return value }
        if fields[field] == nil, let fallback { return fallback }
        throw MicroChatError.invalidKeys
    }
    static func getBytes(_ fields: [Int: Value], _ field: Int) throws -> Data {
        guard case .bytes(let value)? = fields[field] else { throw MicroChatError.invalidKeys }
        return value
    }
    static func only(_ fields: [Int: Value], _ allowed: Set<Int>) throws {
        guard Set(fields.keys).isSubset(of: allowed) else { throw MicroChatError.invalidKeys }
    }
}

struct TinkPublicKey {
    enum Kind { case hpke, signing }
    let raw: Data
    let id: UInt32
    var prefix: Data { Self.prefix(id) }
    static func prefix(_ id: UInt32) -> Data {
        Data([1, UInt8(truncatingIfNeeded: id >> 24), UInt8(truncatingIfNeeded: id >> 16),
              UInt8(truncatingIfNeeded: id >> 8), UInt8(truncatingIfNeeded: id)])
    }
    static func typeURL(_ kind: Kind) -> Data {
        Data(("type.googleapis.com/google.crypto.tink." + (kind == .hpke ? "HpkePublicKey" : "Ed25519PublicKey")).utf8)
    }
    static func encode(raw: Data, id: UInt32, kind: Kind) -> String {
        let key: Data
        if kind == .hpke {
            // These are Tink proto enum values, not RFC 9180 suite identifiers.
            let params = Proto.number(1, 1) + Proto.number(2, 1) + Proto.number(3, 2)
            key = Proto.bytes(2, params) + Proto.bytes(3, raw)
        } else { key = Proto.bytes(2, raw) }
        let data = Proto.bytes(1, typeURL(kind)) + Proto.bytes(2, key) + Proto.number(3, 3)
        let entry = Proto.bytes(1, data) + Proto.number(2, 1) + Proto.number(3, UInt64(id)) + Proto.number(4, 1)
        return Wire.encode(Proto.number(1, UInt64(id)) + Proto.bytes(2, entry))
    }
    static func parse(_ value: String, kind: Kind) throws -> TinkPublicKey {
        let set = try Proto.parse(Wire.decode(value, limit: 4096))
        try Proto.only(set, [1, 2])
        let primary = try Proto.getNumber(set, 1)
        guard primary > 0, primary <= UInt32.max else { throw MicroChatError.invalidKeys }
        let entry = try Proto.parse(Proto.getBytes(set, 2))
        try Proto.only(entry, [1, 2, 3, 4])
        guard try Proto.getNumber(entry, 2) == 1, try Proto.getNumber(entry, 3) == primary,
              try Proto.getNumber(entry, 4) == 1 else { throw MicroChatError.invalidKeys }
        let data = try Proto.parse(Proto.getBytes(entry, 1))
        try Proto.only(data, [1, 2, 3])
        guard try Proto.getBytes(data, 1) == typeURL(kind), try Proto.getNumber(data, 3) == 3 else {
            throw MicroChatError.invalidKeys
        }
        let key = try Proto.parse(Proto.getBytes(data, 2))
        guard try Proto.getNumber(key, 1, default: 0) == 0 else { throw MicroChatError.invalidKeys }
        let raw: Data
        if kind == .hpke {
            try Proto.only(key, [1, 2, 3])
            let params = try Proto.parse(Proto.getBytes(key, 2))
            try Proto.only(params, [1, 2, 3])
            guard try Proto.getNumber(params, 1) == 1, try Proto.getNumber(params, 2) == 1,
                  try Proto.getNumber(params, 3) == 2 else { throw MicroChatError.invalidKeys }
            raw = try Proto.getBytes(key, 3)
        } else {
            try Proto.only(key, [1, 2]); raw = try Proto.getBytes(key, 2)
        }
        guard raw.count == 32 else { throw MicroChatError.invalidKeys }
        return TinkPublicKey(raw: raw, id: UInt32(primary))
    }
}
