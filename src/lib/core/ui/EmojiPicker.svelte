<script lang="ts" module>
  // Subconjunto popular de emojis por categoria (sem dependência externa).
  const CATEGORIAS: { id: string; icone: string; emojis: string[] }[] = [
    { id: 'Rostos', icone: '😀', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','🤔','🤨','😐','😑','😶','🙄','😏','😴','😌','😔','🥱','😬','🤐','🤗','🤭','🥳','😎','🤓','😢','😭','😤','😠','😡','🥺','😳','😱','😨','😰','😥','🤯','🙈'] },
    { id: 'Gestos', icone: '👍', emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👏','🙌','👐','🙏','🤝','💪','👋','☝️','✋','🖐️','🤚','👊','✊','🫶','🫡','🤌','👇','👆','👈','👉'] },
    { id: 'Amor', icone: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💖','💘','💝','💔','❣️','💯','✨','🎉','🎊','🔥','⭐','🌟','💫','👑'] },
    { id: 'Trabalho', icone: '💼', emojis: ['📌','📎','🖇️','📁','📂','📄','📃','📊','📈','📉','✅','❌','⚠️','❗','❓','⏰','📅','🗓️','💼','🖥️','💻','📱','☎️','📞','💬','🗨️','🔔','🔒','🔑','📝','✏️','🔍','📦','🚀','💡','🎯'] },
    { id: 'Comida', icone: '🍕', emojis: ['☕','🍵','🧉','🥤','🍕','🍔','🍟','🌭','🥪','🌮','🌯','🍜','🍝','🍛','🍲','🥗','🍱','🍣','🍤','🍩','🍪','🎂','🍰','🍫','🍿','🍎','🍌','🍇','🍉','🍓','🥑','🥨'] },
    { id: 'Símbolos', icone: '✔️', emojis: ['✔️','➕','➖','✖️','➗','♻️','✅','🆗','🆕','🔝','🔜','⬆️','⬇️','➡️','⬅️','🔄','🔆','🟢','🟡','🟠','🔴','⚫','⚪','🔵','🟣','🏳️','🚩','📍','🕐','💲','©️'] }
  ];
  export { CATEGORIAS };
</script>

<script lang="ts">
  let { onpick }: { onpick: (e: string) => void } = $props();
  let cat = $state(0);
</script>

<div class="picker">
  <div class="tabs">
    {#each CATEGORIAS as c, i (c.id)}
      <button type="button" class="tab" class:on={cat === i} title={c.id} onclick={() => (cat = i)}>{c.icone}</button>
    {/each}
  </div>
  <div class="grid">
    {#each CATEGORIAS[cat].emojis as e, i (cat + '-' + i)}
      <button type="button" class="emoji" onclick={() => onpick(e)}>{e}</button>
    {/each}
  </div>
</div>

<style>
  .picker { width: 320px; max-width: 86vw; background: #fff; border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; display: flex; flex-direction: column; }
  .tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--surface-2); }
  .tab { flex: 1; border: none; background: transparent; padding: 0.5rem 0; font-size: 1.05rem; border-bottom: 2px solid transparent; border-radius: 0; }
  .tab:hover { background: #fff; color: inherit; }
  .tab.on { border-bottom-color: #00a884; background: #fff; }
  .grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.1rem; padding: 0.5rem; max-height: 220px; overflow-y: auto; }
  .emoji { border: none; background: transparent; font-size: 1.25rem; padding: 0.25rem 0; border-radius: 8px; line-height: 1.2; }
  .emoji:hover { background: var(--surface-2); }
</style>
