Feature: vault

  The owner's content is kept in their own browser, sealed under a device key
  the browser makes and never lets out. The vault decides nothing itself: the
  Boundary and two proved LexLean modules, PrismVaultStore and PrismVaultRestore,
  answer every keep and every read, and the vault obeys. All values are synthetic.

  @VS-01 @build
  Scenario: The vault keeps a value only when the Boundary and the proved store decision allow it: sealed under a non-extractable device key, filed under an address that re-derives from the value, and as a keyed hash only for card or restricted data
    Given the vault in site/vault/vault.mjs and the guests built from PrismBoundary and PrismVaultStore
    When the owner keeps synthetic values with each label, detector and approval
    Then a value comes back with its label, under an address that re-derives from it
    And neither the stored bytes nor the index hold the value or its label
    And a value filed under an address it does not re-derive to is refused
    And card data and restricted data are kept as a keyed hash and a pointer, never the value
    And while the kill switch is on nothing new is kept and reading stays open
    And an answer the vault does not expect is obeyed as a refusal

  @VS-02 @build
  Scenario: The vault restores a value only when the proved restore decision allows it: a flipped bit, a swapped object, an unknown envelope or a lost key ring is refused, and nothing is deleted
    Given a vault holding synthetic values and the guest built from PrismVaultRestore
    When a stored object has one bit flipped, two objects are swapped, or the envelope version is unknown
    Then each read is refused, and the repaired object restores again
    And when the key ring is gone every read and keep is refused and every object stays on disk
    And a guest whose bytes are not the pinned fingerprint is never compiled

  @VS-03 @build
  Scenario: The owner's device key is made by the browser and never leaves it: no passphrase is asked to keep or read a value, only to make or read an encrypted export, and a wrong or tampered export is refused
    Given a vault opened with no passphrase
    When it is opened again, exported with a backup passphrase and imported into a second vault
    Then the key ring holds only non-extractable keys and exporting their bytes is refused
    And the reopened vault restores the value without asking anything
    And an export needs a passphrase and holds no value or label
    And a wrong passphrase, a flipped bit or a truncated file refuses the whole import
    And an import files every value again through the Boundary under the new vault's own keys
    And the browser is asked to persist the storage, in OPFS and in the IndexedDB fallback
