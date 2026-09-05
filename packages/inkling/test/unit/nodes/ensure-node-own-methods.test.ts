import { describe, expect, it } from 'vitest'

import { ensureLexicalNodeOwnMethods } from '@/nodes/base/ensure-node-own-methods'

describe('ensureLexicalNodeOwnMethods', () => {
  // Simulate the generateDecoratorNode pattern:
  // A base class with static and instance methods, then subclasses that inherit them.
  class GeneratedBase {
    static getType() {
      return 'generated'
    }
    static clone(node: GeneratedBase) {
      return new GeneratedBase()
    }
    static importJSON() {
      return new GeneratedBase()
    }
    exportJSON() {
      return { type: 'generated', version: 1 }
    }
  }

  class BaseNode extends GeneratedBase {
    static importDOM() {
      return {}
    }
  }

  class OuterNode extends BaseNode {
    decorate() {
      return null
    }
  }

  it('static methods should be own properties on the class that defines them', () => {
    expect(Object.hasOwn(GeneratedBase, 'getType')).toBe(true)
    expect(Object.hasOwn(GeneratedBase, 'clone')).toBe(true)
    expect(Object.hasOwn(GeneratedBase, 'importJSON')).toBe(true)
  })

  it('inherited static methods should NOT be own properties on subclass', () => {
    // This is the core issue: hasOwnProperty returns false for inherited statics
    expect(Object.hasOwn(OuterNode, 'getType')).toBe(false)
    expect(Object.hasOwn(OuterNode, 'clone')).toBe(false)
    expect(Object.hasOwn(OuterNode, 'importJSON')).toBe(false)
  })

  it('inherited instance methods should NOT be own properties on subclass prototype', () => {
    expect(Object.hasOwn(OuterNode.prototype, 'exportJSON')).toBe(false)
  })

  it('should copy inherited static methods as own properties', () => {
    ensureLexicalNodeOwnMethods(OuterNode)

    expect(Object.hasOwn(OuterNode, 'getType')).toBe(true)
    expect(Object.hasOwn(OuterNode, 'clone')).toBe(true)
    expect(Object.hasOwn(OuterNode, 'importJSON')).toBe(true)

    // Verify the methods still work correctly
    expect(OuterNode.getType()).toBe('generated')
  })

  it('should copy inherited exportJSON as own property on prototype', () => {
    ensureLexicalNodeOwnMethods(OuterNode)

    expect(Object.hasOwn(OuterNode.prototype, 'exportJSON')).toBe(true)

    // Verify the method still works correctly
    const node = new OuterNode()
    expect(node.exportJSON()).toEqual({ type: 'generated', version: 1 })
  })

  it('should preserve overridden methods', () => {
    class ChildWithOverride extends GeneratedBase {
      static getType() {
        return 'child-override'
      }
      exportJSON() {
        return { type: 'child-override', version: 2 }
      }
    }

    // Already own properties
    expect(Object.hasOwn(ChildWithOverride, 'getType')).toBe(true)
    expect(Object.hasOwn(ChildWithOverride.prototype, 'exportJSON')).toBe(true)

    ensureLexicalNodeOwnMethods(ChildWithOverride)

    // Preserved
    expect(ChildWithOverride.getType()).toBe('child-override')
    expect(new ChildWithOverride().exportJSON()).toEqual({ type: 'child-override', version: 2 })
  })

  it('should handle non-function inputs gracefully', () => {
    expect(() => ensureLexicalNodeOwnMethods(null)).not.toThrow()
    expect(() => ensureLexicalNodeOwnMethods(undefined)).not.toThrow()
    expect(() => ensureLexicalNodeOwnMethods('not a class')).not.toThrow()
    expect(() => ensureLexicalNodeOwnMethods(42)).not.toThrow()
  })

  it('should make methods writable and configurable', () => {
    ensureLexicalNodeOwnMethods(OuterNode)

    const desc = Object.getOwnPropertyDescriptor(OuterNode, 'getType')
    expect(desc?.writable).toBe(true)
    expect(desc?.configurable).toBe(true)

    const protoDesc = Object.getOwnPropertyDescriptor(OuterNode.prototype, 'exportJSON')
    expect(protoDesc?.writable).toBe(true)
    expect(protoDesc?.configurable).toBe(true)
  })

  it('should be idempotent (safe to call multiple times)', () => {
    ensureLexicalNodeOwnMethods(OuterNode)
    ensureLexicalNodeOwnMethods(OuterNode)

    expect(Object.hasOwn(OuterNode, 'getType')).toBe(true)
    expect(OuterNode.getType()).toBe('generated')
  })
})
