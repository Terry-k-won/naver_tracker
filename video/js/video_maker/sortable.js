/**
 * SortableGrid: 마우스 드래그 앤 드롭으로 사진 카드의 순서를 직관적으로 변경하는 컴포넌트
 */
class SortableGrid {
  constructor(container, onOrderChange) {
    this.container = container;
    this.onOrderChange = onOrderChange;
    this.draggedItem = null;
    this.draggedIndex = -1;
    this.init();
  }

  init() {
    this.container.addEventListener('dragstart', this.handleDragStart.bind(this));
    this.container.addEventListener('dragover', this.handleDragOver.bind(this));
    this.container.addEventListener('dragenter', this.handleDragEnter.bind(this));
    this.container.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.container.addEventListener('drop', this.handleDrop.bind(this));
    this.container.addEventListener('dragend', this.handleDragEnd.bind(this));
  }

  handleDragStart(e) {
    const card = e.target.closest('.photo-card');
    if (!card) return;

    this.draggedItem = card;
    this.draggedIndex = Array.from(this.container.children).indexOf(card);
    
    // 드래그 고스트 이미지 투명도 및 클래스
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedIndex);
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetCard = e.target.closest('.photo-card');
    if (!targetCard || targetCard === this.draggedItem) return;

    const cards = Array.from(this.container.children);
    const targetIndex = cards.indexOf(targetCard);
    const currentIndex = cards.indexOf(this.draggedItem);

    if (targetIndex !== currentIndex) {
      if (currentIndex < targetIndex) {
        this.container.insertBefore(this.draggedItem, targetCard.nextSibling);
      } else {
        this.container.insertBefore(this.draggedItem, targetCard);
      }
    }
  }

  handleDragEnter(e) {
    e.preventDefault();
    const targetCard = e.target.closest('.photo-card');
    if (targetCard && targetCard !== this.draggedItem) {
      targetCard.classList.add('drag-over-card');
    }
  }

  handleDragLeave(e) {
    const targetCard = e.target.closest('.photo-card');
    if (targetCard) {
      targetCard.classList.remove('drag-over-card');
    }
  }

  handleDrop(e) {
    e.preventDefault();
    this.cleanStyles();
  }

  handleDragEnd(e) {
    this.cleanStyles();
    if (this.draggedItem) {
      this.draggedItem.classList.remove('is-dragging');
      this.draggedItem = null;
    }

    if (this.onOrderChange) {
      const newOrderIds = Array.from(this.container.children).map(c => c.dataset.id);
      this.onOrderChange(newOrderIds);
    }
  }

  cleanStyles() {
    Array.from(this.container.children).forEach(child => {
      child.classList.remove('drag-over-card', 'is-dragging');
    });
  }
}

window.SortableGrid = SortableGrid;
